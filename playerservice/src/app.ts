import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { connectDB } from './db/index.js';
import cookieParser from 'cookie-parser';
import devRoute from './routes/developer.routes.js';
import playerRoute from './routes/player.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

connectDB();

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello World' });
});
app.use("/api/",devRoute);
app.use("/api/",playerRoute);


app.listen(PORT, () => {
    try {
          console.log(`Server is running at port ${PORT}`);
    } catch (error) {
        console.error("Something went wrong on server starting point ,",error);
    }
});