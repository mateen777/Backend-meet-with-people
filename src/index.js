import dotenv from "dotenv";
import { httpServer } from "./app.js";

dotenv.config({ path:'./.env' });


const startServer = () => {
    httpServer.listen(process.env.PORT || 8080, () => {
      console.log("⚙️  Server is running on port: " + process.env.PORT);
    });
  };

startServer();