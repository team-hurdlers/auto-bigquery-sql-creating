const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

class GoogleApisConfig {
  constructor() {
    this.oauth2Client = null;
    this.initialized = false;
  }

  initializeOAuth() {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback'
      );
      this.initialized = true;
      return this.oauth2Client;
    }
    return null;
  }

  initializeServiceAccount() {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const auth = new google.auth.GoogleAuth({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/bigquery',
          'https://www.googleapis.com/auth/drive.readonly'
        ]
      });
      this.initialized = true;
      return auth;
    }
    return null;
  }

  getAuthClient() {
    if (!this.initialized) {
      const oauth = this.initializeOAuth();
      if (oauth) return oauth;
      
      const serviceAccount = this.initializeServiceAccount();
      if (serviceAccount) return serviceAccount;
      
      throw new Error('Google API 인증 설정이 필요합니다. .env 파일을 확인해주세요.');
    }
    return this.oauth2Client;
  }

  getAuthUrl() {
    if (!this.oauth2Client) {
      this.initializeOAuth();
    }
    
    if (!this.oauth2Client) {
      throw new Error('OAuth2 클라이언트가 초기화되지 않았습니다.');
    }

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/cloud-platform.read-only'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  async getTokenFromCode(code) {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 클라이언트가 초기화되지 않았습니다.');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  setCredentials(tokens) {
    if (!this.oauth2Client) {
      this.initializeOAuth();
    }
    if (this.oauth2Client) {
      this.oauth2Client.setCredentials(tokens);
    }
  }

  getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth: auth || this.getAuthClient() });
  }

  getBigQueryClient(auth) {
    return google.bigquery({ version: 'v2', auth: auth || this.getAuthClient() });
  }

  getDriveClient(auth) {
    return google.drive({ version: 'v3', auth: auth || this.getAuthClient() });
  }
}

module.exports = new GoogleApisConfig();