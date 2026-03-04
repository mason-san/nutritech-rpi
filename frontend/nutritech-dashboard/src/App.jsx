import {Routes, Route} from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Experiments from "./pages/Experiments";
import ExperimentDetails from "./pages/ExperimentDetails";

function App(){
  return(
    <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/experiments" element={<Experiments />} />
          <Route
            path="/experiments/:experimentId"
            element={<ExperimentDetails />}
          />
        </Routes>
    </Layout>
  );
}

export default App;