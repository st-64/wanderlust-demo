document.querySelectorAll("[data-upload-zone]").forEach((zone) => {
    const input = zone.querySelector("[data-image-input]");
    const preview = zone.parentElement.querySelector("[data-image-previews]");
    const count = zone.querySelector("[data-image-count]");
    const error = zone.parentElement.querySelector("[data-upload-error]");
    if (!input || !preview || !count || !error) return;

    const maximumFiles = 8;
    const maximumFileSize = 8 * 1024 * 1024;
    const optimizeAboveBytes = 1024 * 1024;
    const maximumImageDimension = 1920;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    let previewUrls = [];
    let submitAfterOptimization = false;

    const clearPreviewUrls = () => {
        previewUrls.forEach((url) => URL.revokeObjectURL(url));
        previewUrls = [];
    };

    const updatePreview = () => {
        clearPreviewUrls();
        preview.replaceChildren();
        error.textContent = "";

        const files = Array.from(input.files || []);
        const invalidFile = files.find((file) =>
            !allowedTypes.has(file.type) || file.size > maximumFileSize
        );
        if (files.length > maximumFiles || invalidFile) {
            error.textContent = files.length > maximumFiles
                ? `Choose no more than ${maximumFiles} photos at a time.`
                : `${invalidFile.name} is not a supported image or is larger than 8 MB.`;
            input.value = "";
            count.textContent = "No photos selected";
            return;
        }

        count.textContent = files.length === 0
            ? "No photos selected"
            : `${files.length} photo${files.length === 1 ? "" : "s"} selected`;

        files.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            previewUrls.push(url);
            const figure = document.createElement("figure");
            figure.className = "photo-preview";
            const image = document.createElement("img");
            image.src = url;
            image.alt = `Selected photo ${index + 1}: ${file.name}`;
            const caption = document.createElement("figcaption");
            caption.textContent = index === 0 ? "Cover photo" : `Photo ${index + 1}`;
            figure.append(image, caption);
            preview.append(figure);
        });
    };

    const optimizeImage = async (file) => {
        if (typeof createImageBitmap !== "function") return file;
        const bitmap = await createImageBitmap(file);
        try {
            const scale = Math.min(
                1,
                maximumImageDimension / Math.max(bitmap.width, bitmap.height)
            );
            if (file.size <= optimizeAboveBytes && scale === 1) return file;

            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext("2d");
            if (!context) return file;
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise((resolve) =>
                canvas.toBlob(resolve, "image/webp", 0.82)
            );
            if (!blob || blob.size >= file.size) return file;

            const optimizedName = file.name.replace(/\.[^.]+$/, "") + ".webp";
            return new File([blob], optimizedName, {
                type: "image/webp",
                lastModified: file.lastModified,
            });
        } finally {
            bitmap.close();
        }
    };

    input.addEventListener("change", updatePreview);
    zone.addEventListener("dragover", (event) => {
        event.preventDefault();
        zone.classList.add("is-dragging");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
    zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragging");
        if (event.dataTransfer?.files) {
            input.files = event.dataTransfer.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    zone.closest("form")?.addEventListener("submit", async (event) => {
        if (submitAfterOptimization) {
            submitAfterOptimization = false;
            return;
        }
        if (input.required && input.files.length === 0) {
            event.preventDefault();
            event.stopPropagation();
            error.textContent = "Choose at least one photo before creating your listing.";
            zone.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        const files = Array.from(input.files || []);
        if (files.length === 0) return;

        event.preventDefault();
        const form = zone.closest("form");
        const submitter = event.submitter;
        if (submitter) submitter.disabled = true;
        count.textContent = "Optimizing photos for upload…";
        error.textContent = "";
        try {
            const transfer = new DataTransfer();
            for (const file of files) transfer.items.add(await optimizeImage(file));
            input.files = transfer.files;
            updatePreview();
            submitAfterOptimization = true;
            if (submitter) submitter.disabled = false;
            form.requestSubmit(submitter || undefined);
        } catch {
            error.textContent = "Photos could not be prepared for upload. Please try again.";
            count.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} selected`;
            if (submitter) submitter.disabled = false;
        }
    });

    window.addEventListener("pagehide", clearPreviewUrls, { once: true });
});

const profileImageInput = document.querySelector("[data-profile-image-input]");
if (profileImageInput) {
    const preview = document.querySelector("[data-profile-preview]");
    const fallback = document.querySelector("[data-profile-fallback]");
    const error = document.querySelector("[data-profile-image-error]");
    profileImageInput.addEventListener("change", () => {
        const file = profileImageInput.files[0];
        error.textContent = "";
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
            error.textContent = "Choose a JPG, PNG, or WebP image under 5 MB.";
            profileImageInput.value = "";
            return;
        }
        preview.src = URL.createObjectURL(file);
        preview.classList.remove("d-none");
        if (fallback) fallback.classList.add("d-none");
    });
}
