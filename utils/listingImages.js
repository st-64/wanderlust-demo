const { cloudinary } = require("../cloudConfig");

function getListingImages(listing) {
    const gallery = (listing.images || []).filter((image) => image && image.url);
    if (gallery.length > 0) return gallery;

    return listing.image?.url ? [listing.image] : [];
}

function getListingCoverImage(listing) {
    return getListingImages(listing)[0]?.url || "/images/listing-placeholder.svg";
}

function uploadedListingImages(files = []) {
    return files.map((file) => ({
        url: file.path,
        filename: file.filename,
    }));
}

async function deleteCloudinaryImages(images = []) {
    const filenames = [...new Set(images
        .map((image) => image && image.filename)
        .filter((filename) => filename && filename !== "listingimage"))];

    const results = await Promise.allSettled(
        filenames.map((filename) => cloudinary.uploader.destroy(filename))
    );

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.error(`Failed to delete Cloudinary image ${filenames[index]}:`, result.reason);
        }
    });
}

module.exports = { getListingImages, getListingCoverImage, uploadedListingImages, deleteCloudinaryImages };
