import { Hono } from 'hono'
import testRoutes from './routes/test'
import authRoutes from './routes/auth'
import attachmentRoutes from './routes/attachments'
import oAuthRoutes from './routes/oauth'
import userSettingsRoutes from './routes/user-settings'
import { cors } from 'hono/cors'
import { Control } from './do/control'
import { User } from './do/user'

const app = new Hono<({Bindings: CloudflareBindings})>()
.get('/', (c) => {
  return c.text('Hello Hono!')
})
.use('*', async (c, next) => {
  if (c.env.WORKER_ENV !== "local") {
    return next()
  }

  const corsMiddlewareHandler = cors({
    origin: ['http://localhost:5180', 'https://localhost:5180'],
    credentials: true
  })

  return corsMiddlewareHandler(c, next)
})


const routes = app
  .route('/test', testRoutes)
  .route('/auth', authRoutes)
  .route('/attachments', attachmentRoutes)
  .route('/oauth', oAuthRoutes)
  .route('/user-settings', userSettingsRoutes)

export { Control }
export { User }

export default app
export type AppType = typeof routes
