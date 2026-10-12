document.querySelectorAll("[data-payment-checkout]").forEach((button) => {
    const message = document.querySelector("[data-payment-message]");
    if (!message) return;

    const setMessage = (text, isError = false, isSuccess = false) => {
        message.textContent = text;
        message.classList.toggle("is-error", isError);
        message.classList.toggle("is-success", isSuccess && !isError);
    };

    const loadCheckout = () => new Promise((resolve, reject) => {
        if (window.Razorpay) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Secure checkout could not be loaded."));
        document.head.append(script);
    });

    button.addEventListener("click", async () => {
        button.disabled = true;
        setMessage("Preparing a secure payment order…");
        try {
            const orderResponse = await fetch(`/bookings/${button.dataset.bookingId}/checkout`, {
                method: "POST",
                headers: {
                    "Accept": "application/json",
                    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
                },
                credentials: "same-origin",
            });
            const order = await orderResponse.json().catch(() => ({}));
            if (!orderResponse.ok) {
                throw new Error(order.message || "The payment order could not be created. The booking remains unconfirmed.");
            }
            await loadCheckout();

            const checkout = new window.Razorpay({
                key: order.keyId,
                order_id: order.orderId,
                amount: order.amount,
                currency: order.currency,
                name: "Wanderlust",
                description: "Booking payment",
                handler: async (providerResponse) => {
                    let waitForReconciliation = false;
                    setMessage("Verifying payment with the server…");
                    try {
                        const response = await fetch(`/bookings/${button.dataset.bookingId}/verify`, {
                            method: "POST",
                            headers: {
                                "Accept": "application/json",
                                "Content-Type": "application/json",
                                "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || "",
                            },
                            credentials: "same-origin",
                            body: JSON.stringify(providerResponse),
                        });
                        const result = await response.json();
                        setMessage(
                            result.message || "Payment status is being checked.",
                            !response.ok || result.status === "refund_required",
                            result.status === "confirmed"
                        );
                        waitForReconciliation = ["processing", "refund_required"].includes(result.status);
                        if (result.status === "confirmed") {
                            window.location.assign(result.bookingUrl);
                        }
                    } catch {
                        setMessage("Payment verification could not be completed. The booking is not confirmed; check My Trips before retrying.", true);
                    } finally {
                        button.disabled = waitForReconciliation;
                    }
                },
                modal: {
                    ondismiss: () => {
                        setMessage("Checkout was closed. Your booking remains unconfirmed while the date hold is active.");
                        button.disabled = false;
                    },
                },
                theme: { color: "#222222" },
            });
            checkout.on("payment.failed", () => {
                setMessage("The provider reported a failed attempt. Your booking remains unconfirmed.", true);
                button.disabled = false;
            });
            checkout.open();
        } catch (error) {
            setMessage(error.message || "Secure checkout could not be started.", true);
            button.disabled = false;
        }
    });
});
