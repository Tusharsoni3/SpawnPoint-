import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { connectDB } from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

connectDB();

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello World' });
});

app.listen(PORT, () => {
    try {
          console.log(`Server is running at port ${PORT}`);
    } catch (error) {
        console.error("Something went wrong on server starting point ,",error);
    }
});