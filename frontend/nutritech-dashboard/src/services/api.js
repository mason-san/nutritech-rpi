import axios from "axios"; 

const API = axios.create({
    baseURL: "https://nutritech-rpi.onrender.com/api",
}); 

export default API; 