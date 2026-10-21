// ============================================================================
// Caregiver Module Router — mounted at /caregiver
// ============================================================================

import { Router } from 'express';
import { caregiversRouter } from './caregivers.routes.js';
import { bookingsRouter } from './bookings.routes.js';
import { schedulesRouter } from './schedules.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { carePlansRouter } from './care-plans.routes.js';
import { tasksRouter } from './tasks.routes.js';
import { reportsRouter } from './reports.routes.js';
import { reviewsRouter } from './reviews.routes.js';

export const caregiverRouter = Router();

caregiverRouter.use('/bookings', bookingsRouter);
caregiverRouter.use('/schedules', schedulesRouter);
caregiverRouter.use('/attendance', attendanceRouter);
caregiverRouter.use('/care-plans', carePlansRouter);
caregiverRouter.use('/tasks', tasksRouter);
caregiverRouter.use('/reports', reportsRouter);
caregiverRouter.use('/reviews', reviewsRouter);
// Mounted last so /:id in caregiversRouter does not shadow /bookings, etc.
caregiverRouter.use('/', caregiversRouter);
