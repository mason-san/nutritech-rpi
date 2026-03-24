import {Routes, Route} from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Experiments from "./pages/Experiments";
import ExperimentDetails from "./pages/ExperimentDetails";
import Analytics from "./pages/Analytics";
import Thresholds from "./pages/Thresholds";
import ExperimentComparison from "./pages/ExperimentComparison";

/**
 * MAIN APP COMPONENT
 * Sets up the primary layout and routing structure for the NutriTech Dashboard.
 * All pages are wrapped in the shared <Layout> component for consistent navigation/header.
 */
function App(){
  return(
    <Layout>
        <Routes>
          {/* Dashboard Home - Live Tub Monitoring */}
          <Route path="/" element={<Home />} />
          
          {/* Advanced ML Data Visualizations */}
          <Route path="/analytics" element={<Analytics />} />
          
          {/* History of past experiments */}
          <Route path="/experiments" element={<Experiments />} />
          
          {/* Deep dive into a specific experiment's timeline */}
          <Route
            path="/experiments/:experimentId"
            element={<ExperimentDetails />}
          />

          {/* Sensor threshold configuration */}
          <Route path="/thresholds" element={<Thresholds />} />

          {/* Cross-experiment comparison analytics */}
          <Route path="/compare" element={<ExperimentComparison />} />
        </Routes>
    </Layout>
  );
}

export default App;