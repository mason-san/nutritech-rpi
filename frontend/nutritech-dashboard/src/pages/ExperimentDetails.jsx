import { useParams, useNavigate} from "react-router-dom";
import {useState, useEffect} from "react";
import API from "../services/api";

function ExperimentDetails() {
    const { experimentId } = useParams();
    return(
        <div>
            <h1 className="text-3xl font-bold">
                Experiment ID: {experimentId}
            </h1>
        </div>
    );
}

export default ExperimentDetails; 