require('dotenv').config(); // Load the .env variables right at the top
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const cardRoutes = require('./routes/cardRoutes');
const { sequelize } = require('./models/Card'); // Import our Postgres connection

const app = express();
app.use(cors());
app.use(express.json());

// Ensure the uploads directory exists for Multer
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Use Routes
app.use('/api/cards', cardRoutes);

const PORT = process.env.PORT || 5000;

// 1. Authenticate checks if the credentials in your .env are correct
sequelize.authenticate()
    .then(() => {
        console.log('✅ PostgreSQL Connected Successfully');

        // 2. Sync automatically creates or updates the database tables
        // { alter: true } safely updates your table if you add new fields to Card.js later!
        return sequelize.sync({ alter: true });
    })
    .then(() => {
        console.log('✅ Database synced successfully');

        // 3. Start the server ONLY after the DB is connected
        app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ Database Connection Error:', err.message);
    });