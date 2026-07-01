import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import analyseRoute from './routes/analyse';


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api', analyseRoute);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
