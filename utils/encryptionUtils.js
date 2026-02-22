const encryptResponse = (data) => {
    try {
        const jsonStr = JSON.stringify(data);
        const key = "secure-reviews-key";
        const buffer = Buffer.from(jsonStr, 'utf8');
        const output = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            output[i] = buffer[i] ^ key.charCodeAt(i % key.length);
        }
        return output.toString('base64');
    } catch (error) {
        console.error("Encryption error:", error);
        // Fallback or rethrow? For now, rethrow to ensure caller knows it failed
        throw error;
    }
};

module.exports = { encryptResponse };
