import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { connectDB } from './db/index.js';
import cookieParser from 'cookie-parser';
import devRoute from './routes/developer.routes.js';
import playerRoute from './routes/player.routes.js';
import friendRoute from './routes/friend.routes.js'
import http from 'http';
import { setupWebSockets } from './socket/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

connectDB();

const server = http.createServer(app);
setupWebSockets(server);

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello World' });
});
app.use("/api/",devRoute);
app.use("/api/",playerRoute);
app.use("/api/",friendRoute)

app.listen(PORT, () => {
    try {
          console.log(`Server is running at port ${PORT}`);
    } catch (error) {
        console.error("Something went wrong on server starting point ,",error);
    }
});