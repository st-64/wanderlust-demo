document.addEventListener("DOMContentLoaded", () => {
    const galleryDataElement = document.getElementById("listingGalleryData");
    const galleryModalElement = document.getElementById("listingPhotoModal");

    if (galleryDataElement && galleryModalElement) {
        const photos = JSON.parse(galleryDataElement.textContent);
        const modalImage = galleryModalElement.querySelector("[data-gallery-image]");
        const galleryPosition = galleryModalElement.querySelector("[data-gallery-position]");
        const photoModal = bootstrap.Modal.getOrCreateInstance(galleryModalElement);
        let activePhoto = 0;
        let galleryOpener = null;

        const showPhoto = (index) => {
            activePhoto = (index + photos.length) % photos.length;
            modalImage.src = photos[activePhoto].url;
            modalImage.alt = `${photos[activePhoto].title} — photo ${activePhoto + 1}`;
            galleryPosition.textContent = `${activePhoto + 1} / ${photos.length}`;
        };

        document.querySelectorAll("[data-open-photo]").forEach((button) => {
            button.addEventListener("click", () => {
                galleryOpener = button;
                showPhoto(Number(button.dataset.openPhoto));
                photoModal.show();
            });
        });
        galleryModalElement.addEventListener("hide.bs.modal", () => {
            if (galleryModalElement.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });
        galleryModalElement.addEventListener("hidden.bs.modal", () => {
            galleryOpener?.focus();
            galleryOpener = null;
        });
        galleryModalElement.querySelector("[data-gallery-previous]")?.addEventListener("click", () => showPhoto(activePhoto - 1));
        galleryModalElement.querySelector("[data-gallery-next]")?.addEventListener("click", () => showPhoto(activePhoto + 1));
        galleryModalElement.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft") showPhoto(activePhoto - 1);
            if (event.key === "ArrowRight") showPhoto(activePhoto + 1);
        });
        showPhoto(0);
    }

    document.querySelectorAll("[data-review-comment]").forEach((comment) => {
        const card = comment.closest("[data-review-card]");
        const moreButton = card?.querySelector("[data-review-more]");
        if (!card || !moreButton) return;

        comment.classList.add("review-comment-clamped");
        if (comment.scrollHeight > comment.clientHeight + 1) {
            moreButton.hidden = false;
            moreButton.addEventListener("click", () => {
                const isExpanded = comment.classList.toggle("review-comment-expanded");
                moreButton.textContent = isExpanded ? "Show less" : "Show more";
            });
        } else {
            comment.classList.remove("review-comment-clamped");
        }
    });

    const showAllReviewsButton = document.querySelector("[data-show-reviews]");
    showAllReviewsButton?.addEventListener("click", () => {
        document.querySelectorAll(".review-card-hidden").forEach((card) => card.classList.remove("review-card-hidden"));
        showAllReviewsButton.remove();
    });

    document.querySelector("[data-share-listing]")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const originalText = button.innerHTML;
        const shareData = { title: document.title, url: window.location.href };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                if (error.name !== "AbortError") button.textContent = "Unable to share right now";
            }
            return;
        }
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareData.url);
            button.textContent = "Link copied";
            window.setTimeout(() => { button.innerHTML = originalText; }, 1800);
            return;
        }
        button.textContent = "Copy the page URL to share";
        window.setTimeout(() => { button.innerHTML = originalText; }, 2500);
    });
});
