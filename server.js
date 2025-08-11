const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const sheetsRoutes = require('./routes/sheets');
const bigqueryRoutes = require('./routes/bigquery');
const sqlGeneratorRoutes = require('./routes/sql-generator');
const projectsRoutes = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:*", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/bigquery', bigqueryRoutes);
app.use('/api/sql', sqlGeneratorRoutes);
app.use('/api/projects', projectsRoutes);

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    authenticated: !!req.session.tokens,
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || '서버 오류가 발생했습니다.',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log('환경 설정:');
  console.log('- OAuth 설정:', process.env.GOOGLE_CLIENT_ID ? '✓' : '✗');
  console.log('- Service Account:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? '✓' : '✗');
  console.log('- Session Secret:', process.env.SESSION_SECRET ? '✓' : '✗');
  console.log('\n인증 URL: http://localhost:' + PORT + '/api/auth/google');
});