import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email debe ser una dirección válida').max(255),
  password: z.string().min(1, 'Contraseña es requerida').max(128),
});
