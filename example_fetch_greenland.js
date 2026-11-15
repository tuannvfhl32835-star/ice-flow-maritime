// Example: load the prepared JSON from a web app.
// Put greenland_GID001_data.json in your app's public/data/ folder.
async function loadGreenlandData() {
  const response = await fetch("/data/greenland_GID001_data.json");
  if (!response.ok) throw new Error(`Could not load Greenland data: ${response.status}`);
  const data = await response.json();

  console.log("Dataset:", data.dataset.id);
  console.log("Timeseries:", data.timeseries.length);
  console.log("Observations:", data.observations.length);

  // Example values for a chart:
  const chartLabels = data.timeseries.map(row => row.date);
  const areaValues = data.timeseries.map(row => row.change_area_10_km2);
  const lengthValues = data.timeseries.map(row => row.change_length_m);

  // Map marker: GeoJSON order is [longitude, latitude].
  const marker = {
    type: "Feature",
    geometry: data.location,
    properties: { glacier_id: data.dataset.glacier_id }
  };

  return { data, chartLabels, areaValues, lengthValues, marker };
}
