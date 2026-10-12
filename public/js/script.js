// Example starter JavaScript for disabling form submissions if there are invalid fields
(() => {
    'use strict'

    document.querySelectorAll('[data-avatar-image]').forEach(image => {
        const useFallback = () => {
            const fallback = document.createElement('span')
            fallback.className = image.dataset.avatarFallbackClass
            fallback.textContent = image.dataset.avatarInitial || '?'
            fallback.setAttribute('aria-hidden', 'true')
            image.replaceWith(fallback)
        }
        image.addEventListener('error', useFallback, { once: true })
        if (image.complete && image.naturalWidth === 0) useFallback()
    })

    const confirmationBackdrop = document.querySelector('[data-confirmation-backdrop]')
    const confirmationDialog = confirmationBackdrop?.querySelector('[data-confirmation-dialog]')
    const confirmationTitle = confirmationBackdrop?.querySelector('[data-confirmation-title]')
    const confirmationMessage = confirmationBackdrop?.querySelector('[data-confirmation-message]')
    const confirmationCancel = confirmationBackdrop?.querySelector('[data-confirmation-cancel]')
    const confirmationAccept = confirmationBackdrop?.querySelector('[data-confirmation-accept]')
    let pendingConfirmationForm
    let previousFocus

    const closeConfirmation = () => {
        if (!confirmationBackdrop || confirmationBackdrop.hidden) return
        confirmationBackdrop.hidden = true
        document.body.classList.remove('confirmation-modal-open')
        previousFocus?.focus()
        pendingConfirmationForm = null
    }

    if (
        confirmationBackdrop
        && confirmationDialog
        && confirmationTitle
        && confirmationMessage
        && confirmationCancel
        && confirmationAccept
    ) {
        document.querySelectorAll('form[data-confirm]').forEach(form => {
            form.addEventListener('submit', event => {
                if (form.dataset.confirmed === 'true') {
                    delete form.dataset.confirmed
                    return
                }
                event.preventDefault()
                pendingConfirmationForm = form
                previousFocus = document.activeElement
                confirmationTitle.textContent = form.dataset.confirmTitle || 'Are you sure?'
                confirmationMessage.textContent = form.dataset.confirm
                confirmationAccept.textContent = form.dataset.confirmLabel || 'Continue'
                confirmationBackdrop.hidden = false
                document.body.classList.add('confirmation-modal-open')
                confirmationAccept.focus()
            })
        })

        confirmationCancel.addEventListener('click', closeConfirmation)
        confirmationBackdrop.addEventListener('click', event => {
            if (event.target === confirmationBackdrop) closeConfirmation()
        })
        confirmationAccept.addEventListener('click', () => {
            if (!pendingConfirmationForm) return
            const form = pendingConfirmationForm
            closeConfirmation()
            form.dataset.confirmed = 'true'
            form.requestSubmit()
        })
        confirmationDialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                closeConfirmation()
            } else if (event.key === 'Tab') {
                event.preventDefault()
                (event.shiftKey ? confirmationCancel : confirmationAccept).focus()
            }
        })
    }

    const taxToggle = document.getElementById('taxToggle')
    const taxToggleInfo = document.getElementById('taxToggleInfo')
    if (taxToggle && taxToggleInfo) {
        taxToggle.addEventListener('change', () => {
            taxToggleInfo.hidden = !taxToggle.checked
            taxToggleInfo.classList.toggle('is-visible', taxToggle.checked)
        })
    }

    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    const forms = document.querySelectorAll('.needs-validation')

    // Loop over them and prevent submission
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault()
                event.stopPropagation()
            }

            form.classList.add('was-validated')
        }, false)
    })
})()