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

// CSP 일시적으로 비활성화
// app.use(helmet());

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://auto-bigquery-sql-creating.vercel.app', /\.vercel\.app$/]
    : 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
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