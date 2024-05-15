let elements;
let stripe;

// initialize(
//   "Bearer eyJraWQiOiJ0aFdTQmdyR0lzVERnaXlVMnQxSk8wZW9oREotS3hzaDBpMkMxdVBWdk5VIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULnR5bVkwb2x0Um9UX3NuNm11cFNBV0ZXei1mSXpoSXZQWWptdnZkdFpmeTgub2FyMm9sNWQ0MWhDZ2J6RjIwaDciLCJpc3MiOiJodHRwczovL3BlcHNpY28ub2t0YXByZXZpZXcuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTcxNTc1MTU0OSwiZXhwIjoxNzE1NzU1MTQ5LCJjaWQiOiIwb2ExNjI3eDM4cjB5cGdNSzBoOCIsInVpZCI6IjAwdTIyMHVtbWlsVU1Nc2w0MGg4Iiwic2NwIjpbIm9mZmxpbmVfYWNjZXNzIiwib3BlbmlkIiwicHJvZmlsZSJdLCJhdXRoX3RpbWUiOjE3MTU3NTE1NDcsInN1YiI6ImNlcDE3LTAxMTExMjMyMzIzQHBlcHNpY29ubmVjdC5jb20iLCJlbWFpbCI6ImNlcDE3LTAxMTExMjMyMzIzQHBlcHNpY29ubmVjdC5jb20ifQ.eL1DFM3HZi0drOtDWqzy164F5Duz6Uzw4RPqrv3yqVQTObvf72l-UtVi_EGpcpMf-pi9pC4xcpVBi5I5jY-OwqBWe5pk9DjLoRdKMxj6irxmnmyiwjA1jIt3TarSPUwR7LiY6X5yE4W-8aZquzdIYQYTe8wGFN8zC-nBFxQEbfb62zroEut9PUj1wX1EcOknEWrwFwEtpKU0idd-mXo_QjiRxujkpzrLxEJha5CEXWyghMA1sZAC4E1PlGuzTKSOkujWYJPg7EblctJWw__88C7j988QpJAEyF0vKWSu_uySs9WH5I6nTBxYUDB_XV7mZnIqMCOLOlAALRlU8la--g",
//   "01111232323",
//   "accordion",
//   false
// );

// initStripe(
//   "pk_test_51OoobQIhoMYCIMJxfjMZbjAVCicWGVevZPZpVVgdj0mzPkoJdRjL4gwizPOgpyflDPk78YNBuevOUZSS3egQy5AM00fluM6aqb",
//   "cuss_secret_Q6XpETt1zDbGWvW4VmdVUa6g6TBp4YEMdjvM7ZORWEXoPaR",
//   "accordion"
// );

document
  .querySelector("#payment-form")
  .addEventListener("submit", handleSubmit);

document.querySelector("#submit").classList.add("hidden");
document.querySelector("#confirm").classList.add("hidden");

async function callAPI({ url, method, body }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: window.authorization,
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
async function initialize(token, customerKey, layoutType, nativeAPI) {
  window.authorization = token;

  reactNativePostMessage({
    eventName: "initialize",
    eventData: { token, customerKey, layoutType, nativeAPI },
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

  initStripe(publishableKey, clientSecret, layoutType, nativeAPI);
}

function initStripe(publishableKey, clientSecret, layoutType, nativeAPI) {
  window.nativeAPI = nativeAPI;

  reactNativePostMessage({
    eventName: "initStripe",
    eventData: { publishableKey, clientSecret, layoutType, nativeAPI },
  });

  stripe = Stripe(publishableKey, {
    betas: ["elements_saved_payment_methods_beta_1"],
  });

  const options = {
    customerSessionClientSecret: clientSecret,
    mode: "payment",
    amount: 2500,
    currency: "usd",
    payment_method_types: ["card"],
    captureMethod: "manual",
    paymentMethodCreation: "manual",
    paymentMethodOptions: {
      card: {
        require_cvc_recollection: true,
      },
    },
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
      radios: true,
      spacedAccordionItems: true,
    },
    paymentMethodOrder: ["card"],
  };

  if (layoutType == "accordion") {
    let paymentElementOptionsAccordion = {
      layout: {
        type: "accordion",
        defaultCollapsed: false,
        radios: true,
        spacedAccordionItems: true,
      },
    };
    paymentElementOptions = {
      ...paymentElementOptions,
      ...paymentElementOptionsAccordion,
    };
  }

  const paymentElement = elements.create("payment", paymentElementOptions);
  paymentElement.mount("#payment-element");
  paymentElement.on("ready", () => {
    document.querySelector("#submit").classList.remove("hidden");
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  setLoading(true);

  if (event.submitter.id == "confirm") {
    return handleConfirm();
  }

  const { error: submitError } = await elements.submit();
  if (submitError) {
    showMessage(submitError);
    setLoading(false);
    return;
  }

  const { error, confirmationToken } = await stripe.createConfirmationToken({
    elements,
    params: {},
  });

  if (error) {
    // This point is only reached if there's an immediate error when
    // creating the ConfirmationToken. Show the error to your customer (for example, payment details incomplete)
    reactNativePostMessage({
      eventName: "stripe.confirmationToken",
      eventData: error,
    });
    setLoading(false);
    return;
  }

  window.confirmationToken = confirmationToken;

  showSummary(JSON.stringify(confirmationToken));
  setLoading(false);
  document.querySelector("#submit").classList.add("hidden");
  document.querySelector("#confirm").classList.remove("hidden");
}

async function handleConfirm() {
  confirmationToken = window.confirmationToken;

  if (window.nativeAPI) {
    reactNativePostMessage({
      eventName: "stripe.confirmationToken",
      eventData: { id: confirmationToken.id },
    });
  } else {
    //TODO Call checkout to create paymentIntent and return client secret
    const chargeObj = {
      customerId: "cus_PwnJsViElBR9Ck",
      totalAmount: 2500,
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
  try {
    const paymentResponse =
      typeof checkoutResponse === "string"
        ? JSON.parse(checkoutResponse)
        : checkoutResponse;
    checkStatus(paymentResponse);
    setLoading(false);
  } catch (error) {
    setLoading(false);
  }
}

// Fetches the payment intent status after payment submission
async function checkStatus(paymentResponse) {
  const clientSecret = paymentResponse.clientSecret;

  if (!clientSecret) {
    return;
  }

  switch (paymentResponse.status) {
    case "requires_capture":
      showSummary(JSON.stringify(paymentResponse));
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
  const messageContainer = document.querySelector("#payment-message");

  messageContainer.classList.remove("hidden");
  messageContainer.textContent = messageText;

  setTimeout(function () {
    messageContainer.classList.add("hidden");
    messageContainer.textContent = "";
  }, 10000);
}

function showSummary(last4digits) {
  const summaryContainer = document.querySelector("#summary");
  summaryContainer.classList.remove("hidden");
  summaryContainer.textContent = last4digits;

  document.getElementById("payment-element").classList.add("hidden");

  setTimeout(function () {
    summaryContainer.classList.add("hidden");
    summaryContainer.textContent = "";
  }, 10000);
}

// Show a spinner on payment submission
function setLoading(isLoading) {
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
