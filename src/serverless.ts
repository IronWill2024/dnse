import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express = require('express');

const expressApp = express();
let cachedApp: any;

async function bootstrap() {
  if (cachedApp) return cachedApp;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Basic Auth Middleware (mapping 1:1 với PHP)
  const expectedUser = process.env.BASIC_AUTH_USER || '';
  const expectedPass = process.env.BASIC_AUTH_PASSWORD || '';

  if (expectedUser && expectedPass) {
    app.use((req: any, res: any, next: any) => {
      const authHeader = req.headers['authorization'] || '';
      let isAuthenticated = false;

      const match = authHeader.match(/Basic\s+(.*)$/i);
      if (match) {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
        const colonIndex = decoded.indexOf(':');
        if (colonIndex !== -1) {
          const user = decoded.substring(0, colonIndex);
          const pass = decoded.substring(colonIndex + 1);
          if (user === expectedUser && pass === expectedPass) {
            isAuthenticated = true;
          }
        }
      }

      if (!isAuthenticated) {
        res.setHeader('WWW-Authenticate', 'Basic realm="DNSE API Wrapper"');
        res.setHeader('Content-Type', 'application/json');
        res.status(401).json({ error: true, message: 'Unauthorized Access' });
        return;
      }

      next();
    });
  }

  await app.init();
  cachedApp = app;
  return app;
}

export default async function handler(req: any, res: any) {
  await bootstrap();
  expressApp(req, res);
}
