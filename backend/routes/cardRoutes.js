const express = require('express');
const router = express.Router();
const multer = require('multer');
const cardController = require('../controllers/cardController');

// Configure Multer for local storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Define the routes
// 1. POST: http://localhost:5000/api/cards/upload
router.post('/upload', upload.single('cardImage'), cardController.uploadCard);

// 2. GET: http://localhost:5000/api/cards/download
router.get('/download', cardController.downloadExcel);

module.exports = router;