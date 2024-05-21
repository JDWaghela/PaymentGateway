let elements;
let stripe;

// initialize({
//   token: "",
//   customerKey: "",
//   locale: "en",
//   amount: 2500,
//   currency: "usd",
// });

// initStripe({
//   nativeAPI: true,
//   showWebComponents: false,
//   stripe: {
//     publishableKey: "",
//     options: {
//       betas: ["elements_saved_payment_methods_beta_1"],
//       locale: "en",
//     },
//     elementOptions: {
//       appearance: {
//         theme: "stripe",
//         variables: {
//           fontSizeBase: "1rem",
//         },
//         rules: {
//           ".AccordionItem": {
//             fontSize: "18px",
//           },
//           ".Label": {
//             fontSize: "16px",
//           },
//         },
//       },
//       customerSessionClientSecret: "",
//       amount: 2500,
//       currency: "nzd",
//     },
//     paymentElementsOptions: {
//       savePaymentMethod: {
//         maxVisiblePaymentMethods: 4,
//       },
//     },
//   },
// });

document
  .querySelector("#payment-form")
  .addEventListener("submit", handleSubmit);

document.querySelector("#submit").classList.add("hidden");
document.querySelector("#confirm").classList.add("hidden");

async function callAPI({ url, method, body }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: window.authorization,
    country: window.country,
  };

  return await fetch(`https://apim-na.dev.mypepsico.com/cgf/gpg/v1/${url}`, {
    method,
    headers,
    body,
  })
    .then((response) => response.json())
    .catch((error) => error);
}

// Fetches a payment intent and captures the client secret
async function initialize({
  token,
  country,
  customerKey,
  locale,
  amount,
  currency,
}) {
  window.authorization = token;
  window.country = country;
  window.amount = amount;

  reactNativePostMessage({
    eventName: "initialize",
    eventData: { token, customerKey, locale, amount, currency },
  });

  const configResponse = await callAPI({
    url: "payments/config?application=test",
    method: "GET",
  });

  reactNativePostMessage({ eventName: "config", eventData: configResponse });

  const { publishableKey, error_msg } = configResponse;

  if (error_msg) {
    alert(error_msg);
  }

  const customerResponse = await callAPI({
    url: "payments/customer",
    method: "POST",
    body: JSON.stringify({ customerId: encodeURIComponent(customerKey) }),
  });

  reactNativePostMessage({
    eventName: "customer",
    eventData: customerResponse,
  });

  const { clientSecret } = customerResponse;

  initStripe({
    nativeAPI: false,
    stripe: {
      publishableKey,
      options: {
        locale: locale,
      },
      elementOptions: {
        customerSessionClientSecret: clientSecret,
        amount: amount,
        currency: currency,
      },
      paymentElementOptions: {
        savePaymentMethod: {
          maxVisiblePaymentMethods: 4,
        },
      },
    },
  });
}

function initStripe({
  showWebComponents = true,
  nativeAPI = true,
  stripe: stripeObj = {},
}) {
  try {
    window.nativeAPI = nativeAPI;
    window.showWebComponents = showWebComponents;

    reactNativePostMessage({
      eventName: "initStripe",
      eventData: {
        nativeAPI,
        showWebComponents,
        stripe: stripeObj,
      },
    });

    const missingOptions = [];
    if (stripeObj?.publishableKey === undefined) {
      missingOptions.push("stripe.publishableKey");
    }
    if (stripeObj?.options?.locale === undefined) {
      missingOptions.push("stripe.options.locale");
    }
    if (stripeObj?.elementOptions?.customerSessionClientSecret === undefined) {
      missingOptions.push("stripe.elementOptions.customerSessionClientSecret");
    }
    if (stripeObj?.elementOptions?.amount === undefined) {
      missingOptions.push("stripe.elementOptions.amount");
    }
    if (stripeObj?.elementOptions?.currency === undefined) {
      missingOptions.push("stripe.elementOptions.currency");
    }

    if (missingOptions?.length > 0) {
      setLoading(false);
      reactNativePostMessage({
        eventName: "stripe.configuration.error",
        eventData: {
          message: "Stripe configuration fields are missing.",
          options: missingOptions,
        },
      });
      return;
    }
    stripe = Stripe(stripeObj?.publishableKey, stripeObj?.options);

    const options = {
      mode: "payment",
      payment_method_types: ["card"],
      captureMethod: "manual",
      paymentMethodCreation: "manual",
      paymentMethodOptions: {
        card: {
          require_cvc_recollection: true,
        },
      },
      ...stripeObj?.elementOptions,
    };

    elements = stripe.elements(options);
    let paymentElementOptions = {
      fields: {
        billingDetails: {
          address: {
            country: "never",
            postalCode: "never",
          },
        },
      },
      savePaymentMethod: {
        maxVisiblePaymentMethods: 3,
      },
      layout: {
        type: "accordion",
        defaultCollapsed: false,
        radios: false,
        spacedAccordionItems: false,
      },
      paymentMethodOrder: ["card"],
      ...stripeObj?.paymentElementOptions,
    };

    const paymentElement = elements.create("payment", paymentElementOptions);

    paymentElement.mount("#payment-element");
    paymentElement.on("ready", function (_event) {
      reactNativePostMessage({
        eventName: "stripe.scrollHeight",
        eventData: {
          height: document.querySelector("#payment-element").scrollHeight,
        },
      });
      if (showWebComponents) {
        document.querySelector("#submit").classList.remove("hidden");
      }
      setLoading(false);
    });
  } catch (error) {
    setLoading(false);
    reactNativePostMessage({
      eventName: "stripe.configuration.error",
      eventData: {
        error: error?.message,
      },
    });
  }
}

async function validateElements() {
  try {
    const { error: submitError } = await elements.submit();
    const resultData = {
      result: submitError?.message ? false : true,
      error: submitError?.message,
    };
    if (submitError) {
      reactNativePostMessage({
        eventName: "stripe.submit",
        eventData: resultData,
      });
      showMessage(submitError);
      setLoading(false);
      return resultData;
    } else {
      reactNativePostMessage({
        eventName: "stripe.submit",
        eventData: resultData,
      });
      return resultData;
    }
  } catch (error) {
    const resultData = {
      result: false,
      error: error?.message,
    };
    reactNativePostMessage({
      eventName: "stripe.submit",
      eventData: resultData,
    });
    showMessage(error);
    setLoading(false);
    return resultData;
  }
}

async function getConfirmationToken() {
  try {
    setLoading(true);
    const { error, confirmationToken } = await stripe.createConfirmationToken({
      elements,
      params: {
        payment_method_data: {
          billing_details: {
            address: {
              country: null,
              postal_code: null,
            },
          },
        },
      },
    });

    setLoading(false);
    if (error) {
      reactNativePostMessage({
        eventName: "stripe.confirmationToken.error",
        eventData: { error: error?.message },
      });
    } else {
      reactNativePostMessage({
        eventName: "stripe.confirmationToken",
        eventData: { confirmationToken },
      });
    }
  } catch (error) {
    setLoading(false);
    reactNativePostMessage({
      eventName: "stripe.confirmationToken.error",
      eventData: {
        error: error?.message,
      },
    });
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  setLoading(true);

  if (event.submitter.id == "confirm") {
    return handleConfirm();
  }

  const isValid = await validateElements();

  if (!isValid) {
    return;
  }

  const { error, confirmationToken } = await stripe.createConfirmationToken({
    elements,
    params: {
      payment_method_data: {
        billing_details: {
          address: {
            country: null,
            postal_code: null,
          },
        },
      },
    },
  });

  if (error) {
    // This point is only reached if there's an immediate error when
    // creating the ConfirmationToken. Show the error to your customer (for example, payment details incomplete)
    reactNativePostMessage({
      eventName: "stripe.confirmationToken.error",
      eventData: { error: error?.message },
    });
    setLoading(false);
    return;
  }

  window.confirmationToken = confirmationToken;

  setLoading(false);
  document.querySelector("#payment-element").classList.add("hidden");
  document.querySelector("#submit").classList.add("hidden");
  document.querySelector("#confirm").classList.remove("hidden");
}

async function handleConfirm() {
  let confirmationToken = window.confirmationToken;

  if (window.nativeAPI) {
    reactNativePostMessage({
      eventName: "stripe.confirmationToken",
      eventData: { confirmationToken: window.confirmationToken },
    });
  } else {
    //TODO Call checkout to create paymentIntent and return client secret
    const chargeObj = {
      customerId: "cus_PwnJsViElBR9Ck",
      totalAmount: window.amount,
      paymentMethodType: "card",
      currency: "usd",
      captureFunds: true,
      confirmationTokenId: confirmationToken.id,
    };

    const checkoutResponse = await callAPI({
      url: "payments/checkout",
      method: "POST",
      body: JSON.stringify(chargeObj),
    });

    handleConfirmResponse(checkoutResponse);
  }
}

function handleConfirmResponse(checkoutResponse) {
  setLoading(false);
  try {
    const paymentResponse =
      typeof checkoutResponse === "string"
        ? JSON.parse(checkoutResponse)
        : checkoutResponse;
    checkStatus(paymentResponse);
  } catch (_error) {}
}

// Fetches the payment intent status after payment submission
async function checkStatus(paymentResponse) {
  const clientSecret = paymentResponse?.clientSecret;

  if (!clientSecret) {
    return;
  }

  switch (paymentResponse?.status) {
    case "requires_capture":
      document.getElementById("confirm").classList.add("hidden");
      showMessage("Payment succeeded!");
      break;
    case "succeeded":
      showMessage("Payment succeeded!");
      break;
    case "processing":
      showMessage("Your payment is processing.");
      break;
    case "requires_payment_method":
      showMessage("Your payment was not successful, please try again.");
      break;
    default:
      showMessage("Something went wrong.");
      break;
  }
}

// ------- UI helpers -------

function showMessage(messageText) {
  if (window.showWebComponents) {
    const messageContainer = document.querySelector("#payment-message");

    messageContainer.classList.remove("hidden");
    messageContainer.textContent = messageText;

    setTimeout(function () {
      messageContainer.classList.add("hidden");
      messageContainer.textContent = "";
    }, 10000);
  }
}

// Show a spinner on payment submission
function setLoading(isLoading) {
  reactNativePostMessage({
    eventName: "stripe.isLoading",
    eventData: isLoading,
  });

  if (isLoading) {
    // Disable the button and show a spinner
    document.querySelector("#submit").disabled = true;
    document.querySelector("#confirm").disabled = true;
    document.querySelector("#spinner").classList.remove("hidden");
    document.querySelector("#spinner-confirm").classList.remove("hidden");
    document.querySelector("#button-text").classList.add("hidden");
    document.querySelector("#button-confirm-text").classList.add("hidden");
  } else {
    document.querySelector("#submit").disabled = false;
    document.querySelector("#confirm").disabled = false;
    document.querySelector("#spinner").classList.add("hidden");
    document.querySelector("#spinner-confirm").classList.add("hidden");
    document.querySelector("#button-text").classList.remove("hidden");
    document.querySelector("#button-confirm-text").classList.remove("hidden");
  }
}

function reactNativePostMessage(postData) {
  /* Storing user's device details in a variable*/
  let details = navigator.userAgent;

  /* Creating a regular expression
  containing some mobile devices keywords
  to search it in details string*/
  let regexp = /android|iphone|kindle|ipad/i;

  /* Using test() method to search regexp in details
  it returns boolean value*/
  let isMobileDevice = regexp.test(details);
  if (isMobileDevice) {
    window.ReactNativeWebView.postMessage(JSON.stringify(postData));
  } else {
    console.log(postData);
  }
}
