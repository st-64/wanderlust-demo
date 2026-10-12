const config = require("./config");
const cloudinary = require("cloudinary").v2;
const { pipeline } = require("node:stream");

cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
});

const storage = {
    _handleFile(req, file, callback) {
        let completed = false;
        const finish = (error, result) => {
            if (completed) return;
            completed = true;
            callback(error, result);
        };

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: config.cloudinary.folder,
                resource_type: "image",
                timeout: 180_000,
            },
            (error, result) => {
                if (error) return finish(error);
                if (!result || !result.secure_url || !result.public_id) {
                    return finish(new Error("Cloudinary did not return the uploaded image details."));
                }
                finish(null, {
                    path: result.secure_url,
                    filename: result.public_id,
                    size: result.bytes,
                });
            }
        );

        pipeline(file.stream, uploadStream, (error) => {
            if (error) finish(error);
        });
    },
    _removeFile(req, file, callback) {
        if (!file.filename) return callback(null);
        cloudinary.uploader.destroy(file.filename)
            .then(() => callback(null))
            .catch(callback);
    },
};

function ensureCloudinaryConfigured() {
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) {
        const error = new Error("Image uploads are unavailable until Cloudinary is configured.");
        error.statusCode = 503;
        throw error;
    }
}

module.exports = {
    cloudinary,
    storage,
    ensureCloudinaryConfigured,
};