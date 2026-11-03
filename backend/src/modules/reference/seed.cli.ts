import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ReferenceService } from './reference.service';

async function runSeeder() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const referenceService = app.get(ReferenceService);
  await referenceService.seedReferenceData();
  await referenceService.seedAdminAccount();
  await app.close();
  console.log('Database seeding completed.');
}

runSeeder();
