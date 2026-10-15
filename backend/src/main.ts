import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

// Reloader Function
async function reloadWebsite() {
  const today = new Date().toISOString();

  try {
    const response = await fetch("https://jogmg-backend.onrender.com");
    console.log(`Reloaded at ${today}: Status Code ${response.status}`);
  } catch (error) {
    console.error(
      `Error reloading at ${today}:`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  app.enableCors({
    exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE"],
  });

  await app.listen(process.env.PORT ?? 3001);
  setInterval(reloadWebsite, 5 * 60 * 1000); // Reload every 5 min
}

bootstrap();
