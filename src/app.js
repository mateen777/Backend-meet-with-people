import express from "express"
import cors from "cors"
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeSocketIO } from "./socket/index.js";

const app = express();

const httpServer = createServer(app);

const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.CORS_ORIGIN,
  },
});

app.set("io", io); // using set method to mount the `io` instance on the app to avoid usage of `global`

app.use(cors({
    origin: process.env.CORS_ORIGIN,
}))

app.use(express.json({limit: "16kb"}))
app.use(express.urlencoded({extended: true, limit: "16kb"}))
app.use(express.static("public"))

initializeSocketIO(io);

export { httpServer };