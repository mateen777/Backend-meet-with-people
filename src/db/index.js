import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";


const connectToDB = async () => {
    try {
        const connectionInsta = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log('Database connected succefully');
        console.log(connectionInsta.connection.host);
    } catch (error) {
        console.log(error)
        process.exit(1);
    }
}

export default connectToDB;