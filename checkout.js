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
//   publishableKey: "",
//   clientSecret: "",
//   nativeAPI: false,
//   locale: "en",
//   amount: 2500,
//   currency: "usd",
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
async function initialize({ token, customerKey, locale, amount, currency }) {
  window.authorization = token;

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
    publishableKey,
    clientSecret,
    nativeAPI: false,
    locale,
    amount,
    currency,
  });
}

function initStripe({
  publishableKey,
  clientSecret,
  locale,
  nativeAPI = true,
  amount,
  currency,
}) {
  window.nativeAPI = nativeAPI;

  reactNativePostMessage({
    eventName: "initStripe",
    eventData: {
      publishableKey,
      clientSecret,
      nativeAPI,
      locale,
      amount,
      currency,
    },
  });

  stripe = Stripe(publishableKey, {
    betas: ["elements_saved_payment_methods_beta_1"],
    locale,
  });

  const options = {
    customerSessionClientSecret: clientSecret,
    mode: "payment",
    amount: amount,
    currency: currency,
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

    // For accordion layout
    layout: {
      type: "accordion",
      defaultCollapsed: false,
      radios: true,
      spacedAccordionItems: true,
    },
  };

  const paymentElement = elements.create("payment", paymentElementOptions);
  paymentElement.mount("#payment-element");
  paymentElement.on("ready", () => {
    document
      .querySelector("#payment-collection-notice")
      .classList.remove("hidden");
    document.querySelector("#submit").classList.remove("hidden");
  });
  setLoading(false);
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
      eventName: "stripe.confirmationToken",
      eventData: error,
    });
    setLoading(false);
    return;
  }

  window.confirmationToken = confirmationToken;

  setLoading(false);
  document.querySelector("#payment-element").classList.add("hidden");
  document.querySelector("#payment-collection-notice").classList.add("hidden");
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
  const messageContainer = document.querySelector("#payment-message");

  messageContainer.classList.remove("hidden");
  messageContainer.textContent = messageText;

  setTimeout(function () {
    messageContainer.classList.add("hidden");
    messageContainer.textContent = "";
  }, 10000);
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

function onClickCollectionNotice() {
  reactNativePostMessage({
    eventName: "stripe.collectionNotice",
    eventData: {},
  });
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
