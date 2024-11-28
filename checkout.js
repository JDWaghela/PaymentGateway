let elements;
let stripe;

document.querySelector("#submit").classList.add("hidden");

function initStripe({ stripe: stripeObj = {} }) {
  try {
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
    let hasOptionalAmountBetas = stripeObj?.options?.betas?.includes(
      "deferred_intent_pe_optional_amount_beta_0"
    );
    if (
      !hasOptionalAmountBetas &&
      stripeObj?.elementOptions?.amount === undefined
    ) {
      missingOptions.push("stripe.elementOptions.amount");
    }
    if (stripeObj?.elementOptions?.currency === undefined) {
      missingOptions.push("stripe.elementOptions.currency");
    }

    if (missingOptions?.length > 0) {
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
      document.querySelector("#submit").classList.remove("hidden");
      reactNativePostMessage({
        eventName: "stripe.event.ready",
        eventData: {
          scrollHeight: document.querySelector("#payment-element").scrollHeight,
        },
      });
    });
    paymentElement.on("change", function (event) {
      reactNativePostMessage({
        eventName: "stripe.event.change",
        eventData: event,
      });
    });
    paymentElement.on("click", function (event) {
      reactNativePostMessage({
        eventName: "stripe.event.click",
        eventData: event,
      });
    });
    paymentElement.on("focus", function (event) {
      reactNativePostMessage({
        eventName: "stripe.event.focus",
        eventData: event,
      });
    });
    paymentElement.on("blur", function (event) {
      reactNativePostMessage({
        eventName: "stripe.event.blur",
        eventData: event,
      });
    });
  } catch (error) {
    reactNativePostMessage({
      eventName: "stripe.configuration.error",
      eventData: {
        error: error?.message,
      },
    });
  }
}

function updateElements(options = {}) {
  // Reference : https://docs.stripe.com/js/elements_object/update
  elements.update(options);
}

async function validateElements() {
  try {
    const submitResult = await elements.submit();
    reactNativePostMessage({
      eventName: "stripe.validateElements",
      eventData: submitResult,
    });
  } catch (error) {
    reactNativePostMessage({
      eventName: "stripe.validateElements",
      eventData: {},
    });
  }
}

async function getConfirmationToken(_params = {}) {
  try {
    await validateElements();
    const params = {
      payment_method_data: {
        billing_details: {
          name: "Test",
          email: "",
          phone: "",
          address: {
            city: "",
            country: "NZ",
            line1: "",
            line2: "",
            postal_code: "",
            state: "",
          },
        },
      },
    };
    const startTime = performance.now();
    const confirmationTokenResult = await stripe.createConfirmationToken({
      elements,
      params,
    });
    const endTime = performance.now();
    const executionTime = endTime - startTime;
    console.log(`getConfirmationToken  : ${executionTime} milliseconds`);
    reactNativePostMessage({
      eventName: "stripe.confirmationToken",
      eventData: confirmationTokenResult,
    });
  } catch (error) {
    reactNativePostMessage({
      eventName: "stripe.confirmationToken",
      eventData: { error },
    });
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
