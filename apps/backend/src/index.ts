const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const documentsRoutes = require('./routes/documents');
const generateRoutes = require('./routes/generate');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/documents', documentsRoutes);
app.use('/generate', generateRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 LUMA running on port ${PORT}`));
