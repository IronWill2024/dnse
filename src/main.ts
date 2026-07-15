import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Basic Auth Middleware (mapping 1:1 với PHP index.php lines 65-93)
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

  // Swagger UI — chỉ bật khi DISABLE_SWAGGER !== 'true'
  const disableSwagger = process.env.DISABLE_SWAGGER;
  if (!disableSwagger || disableSwagger === 'false') {
    const config = new DocumentBuilder()
      .setTitle('DNSE SDK API')
      .setDescription('The DNSE OpenAPI SDK Wrapper API description')
      .setVersion('1.0')
      .addTag('dnse')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
