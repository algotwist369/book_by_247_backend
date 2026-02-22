const mongoose = require("mongoose");

// This URI belongs to a separate dedicated database for high-performance microservices
const itemsURI = process.env.MONGO_URI_FOR_GOOGLE_SHEET || "mongodb+srv://infoalgotwist_db_user:oqgmuAaUJMvyISsR@cluster0.mrvbcuo.mongodb.net/whatsapp-leads3";

let microserviceConnection;

const getMicroserviceConnection = () => {
    if (microserviceConnection) return microserviceConnection;

    if (itemsURI) {
        console.log("Microservice DB: Connecting to dedicated separate database...");
        microserviceConnection = mongoose.createConnection(itemsURI);

        microserviceConnection.on('connected', () => {
            console.log("Microservice DB: Connected successfully.");
        });

        microserviceConnection.on('error', (err) => {
            console.error("Microservice DB Error:", err.message);
        });
    } else {
        console.warn("Microservice DB: Connection URI not found, falling back to default connection.");
        microserviceConnection = mongoose.connection;
    }

    return microserviceConnection;
};

module.exports = { getMicroserviceConnection };
