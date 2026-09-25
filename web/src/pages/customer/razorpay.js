/** Loads Razorpay Checkout on demand and opens it. Resolves with the handler response, rejects on dismiss/failure. */
const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export async function openCheckout(checkout) {
  await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: checkout.key,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      theme: { color: '#5a4bd1' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment window closed'), { dismissed: true })) },
    });
    rzp.on('payment.failed', (resp) => reject(new Error(resp?.error?.description || 'Payment failed')));
    rzp.open();
  });
}
