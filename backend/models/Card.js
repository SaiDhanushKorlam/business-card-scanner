require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

// Setup the connection using the single connection string
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false // Set to true if you want to see the SQL queries in the terminal
});

// Define the Schema
const Card = sequelize.define('Card', {
    name: { type: DataTypes.STRING },
    jobTitle: { type: DataTypes.STRING },
    company: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    website: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    rawText: { type: DataTypes.TEXT }
}, {
    timestamps: true
});

module.exports = { Card, sequelize };