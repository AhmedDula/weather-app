
import  { useEffect, useMemo, useState, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  LinearProgress,
  TextField,
  Autocomplete,
  CircularProgress,
  Button,
} from "@mui/material";
import axios from "axios";
import { motion } from "framer-motion"; // Animation library

// API configuration
const API_KEY = process.env.REACT_APP_OWM_KEY;
const GEO_LIMIT = 7;

export default function WeatherWithAutocompleteResponsive() {
  /** -------------------- States -------------------- **/
  const [searchInput, setSearchInput] = useState("");
  const [cityOptions, setCityOptions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [forecastWeather, setForecastWeather] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [error, setError] = useState(null);

  /** -------------------- Refs -------------------- **/
  const geoCache = useRef(new Map()); // cache for city suggestions
  const debounceRef = useRef(null); // debounce timer
  const suggestionsController = useRef(null); // abort controller for suggestions
  const weatherController = useRef(null); // abort controller for weather

  /** -------------------- Fetch city suggestions -------------------- **/
  async function fetchSuggestions(query) {
    if (!query || query.trim().length === 0) {
      setCityOptions([]);
      return;
    }
    const key = query.toLowerCase().trim();

    // Use cached results if available
    if (geoCache.current.has(key)) {
      setCityOptions(geoCache.current.get(key));
      return;
    }

    // Cancel previous request if still active
    if (suggestionsController.current) {
      suggestionsController.current.abort();
    }
    suggestionsController.current = new AbortController();

    setLoadingSuggestions(true);
    try {
      const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
        query
      )}&limit=${GEO_LIMIT}&appid=${API_KEY}`;

      const res = await axios.get(url, {
        signal: suggestionsController.current.signal,
      });

      const list = Array.isArray(res.data) ? res.data : [];
      const mapped = list.map((it) => ({
        name: it.name,
        lat: it.lat,
        lon: it.lon,
        country: it.country,
        state: it.state,
        display: `${it.name}${it.state ? ", " + it.state : ""} — ${it.country}`,
      }));

      geoCache.current.set(key, mapped);
      setCityOptions(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  /** -------------------- Handle input with debounce -------------------- **/
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchInput || searchInput.trim().length < 1) {
      setCityOptions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  /** -------------------- Fetch weather data -------------------- **/
  async function fetchWeatherForCity(city) {
    if (!city) return;
    setSelectedCity(city);
    setSearchInput('')
    setError(null);

    if (weatherController.current) weatherController.current.abort();
    weatherController.current = new AbortController();

    setLoadingWeather(true);
    try {
      const urlCurrent = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&units=metric&appid=${API_KEY}`;
      const urlForecast = `https://api.openweathermap.org/data/2.5/forecast?lat=${city.lat}&lon=${city.lon}&units=metric&appid=${API_KEY}`;

      const [curRes, fRes] = await Promise.all([
        axios.get(urlCurrent, { signal: weatherController.current.signal }),
        axios.get(urlForecast, { signal: weatherController.current.signal }),
      ]);

      setCurrentWeather(curRes.data);
      setForecastWeather(fRes.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load weather data");
    } finally {
      setLoadingWeather(false);
    }
  }

  /** -------------------- Weekly forecast processor -------------------- **/
  const weeklyForecast = useMemo(() => {
    if (!forecastWeather?.list) return [];
    const acc = forecastWeather.list.reduce((map, item) => {
      const tz = forecastWeather.city?.timezone ?? 0;
      const localMs = (item.dt + tz) * 1000;
      const d = new Date(localMs);
      const dateKey = d.toISOString().slice(0, 10);
      if (!map[dateKey]) {
        map[dateKey] = {
          dateKey,
          dayLabel: d.toLocaleDateString(undefined, { weekday: "long" }),
          min: item.main.temp_min,
          max: item.main.temp_max,
          icon: item.weather[0]?.main ?? "",
        };
      } else {
        map[dateKey].min = Math.min(map[dateKey].min, item.main.temp_min);
        map[dateKey].max = Math.max(map[dateKey].max, item.main.temp_max);
      }
      return map;
    }, {});
    return Object.values(acc).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
  }, [forecastWeather]);

  /** -------------------- Hourly forecast processor -------------------- **/
  const hourlyForecast = useMemo(() => {
    if (!forecastWeather?.list) return [];
    const tz = forecastWeather.city?.timezone ?? 0;
    return forecastWeather.list.slice(0, 8).map((item) => {
      const local = new Date((item.dt + tz) * 1000);
      return {
        timeLabel: `${String(local.getUTCHours()).padStart(2, "0")}:00`,
        temp: Math.round(item.main.temp),
        main: item.weather[0]?.main ?? "",
      };
    });
  }, [forecastWeather]);

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        minWidth: "100dvw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#0b1220",
        color: "white",
      }}
    >
      {/* Title with animation */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <Typography
          variant="h5"
          mb={3}
          sx={{ fontSize: { xs: "1.3rem", sm: "1.6rem", md: "2rem" } }}
        >
          Weather App
        </Typography>
      </motion.div>

      {/* Autocomplete Search with animation */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        viewport={{ once: true }}
        style={{
          width: "100%",
          flexWrap: "wrap",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Box width={{ xs: "90%", sm: "80%", md: "70%", lg: "60%" }} mb={2}>
          <Autocomplete
            freeSolo
            filterOptions={(x) => x}
            options={cityOptions}
            getOptionLabel={(opt) =>
              typeof opt === "string" ? opt : opt.display
            }
            onInputChange={(e, val) => setSearchInput(val)}
            inputValue={searchInput}
            onChange={(e, newVal) => {
              if (!newVal) return;
              if (typeof newVal === "string") {
                setSearchInput(newVal);
                fetchSuggestions(newVal).then?.(() => {
                  const cached = geoCache.current.get(
                    newVal.toLowerCase().trim()
                  );
                  if (cached && cached.length > 0)
                    fetchWeatherForCity(cached[0]);
                });
              } else {
                setSearchInput(newVal.display);
                fetchWeatherForCity(newVal);
              }
            }}
            noOptionsText={loadingSuggestions ? "Loading..." : "No results"}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search for a city..."
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingSuggestions ? (
                        <CircularProgress color="inherit" size={18} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
                sx={{
                  bgcolor: "rgba(255,255,255,0.06)",
                  borderRadius: 1,
                  input: { color: "white" },
                }}
              />
            )}
          />
        </Box>
      </motion.div>

      {/* Quick City Buttons with animation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        viewport={{ once: true }}
        style={{
          width: "100%",
          flexWrap: "wrap",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          mb={2}
          flexWrap="wrap"
          width={{ xs: "90%", sm: "80%", md: "70%", lg: "60%" }}
          justifyContent="center"
        >
          {[
            { name: "Cairo", lat: 30.0444, lon: 31.2357 },
            { name: "London", lat: 51.5074, lon: -0.1278 },
            { name: "New York", lat: 40.7128, lon: -74.006 },
            { name: "Paris", lat: 48.8566, lon: 2.3522 },
          ].map((c) => (
            <Button
              key={c.name}
              variant={selectedCity?.name === c.name ? "contained" : "outlined"}
              size="small"
              onClick={() => fetchWeatherForCity(c)}
              sx={{ color: "white", borderColor: "rgba(255,255,255,0.2)" }}
            >
              {c.name}
            </Button>
          ))}
        </Stack>
      </motion.div>

      {/* Weather Display with animation */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.6 }}
        viewport={{ once: true }}
        style={{
          width: "100%",
          flexWrap: "wrap",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Paper
          sx={{
            width: { xs: "90%", sm: "80%", md: "70%", lg: "60%" },
            p: { xs: 0, sm: 3 },
            bgcolor: "rgba(8,15,25,0.6)",
            borderRadius: 2,
            color: "white",
            mb: 4,
          }}
        >
          {loadingWeather ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress color="inherit" />
            </Box>
          ) : error ? (
            <Typography color="error">{error}</Typography>
          ) : !currentWeather ? (
            <Typography p={2}>Search for a city or choose one</Typography>
          ) : (
            <>
              {/* Current Weather */}
              <Box textAlign="center" mb={2}>
                <Typography variant="h6">
                  {currentWeather.name}, {currentWeather.sys?.country}
                </Typography>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: "2rem", sm: "2.5rem", md: "3rem" },
                  }}
                >
                  {Math.round(currentWeather.main.temp)}°C
                </Typography>
                <Typography variant="subtitle1">
                  {currentWeather.weather?.[0]?.description}
                </Typography>
              </Box>

              {/* Hourly Forecast */}
              <Box mb={2}>
                <Typography variant="subtitle2" mb={1}>
                  Hourly Forecast
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  width={"100%"}
                  sx={{ overflowX: "auto" }}
                >
                  {hourlyForecast.map((h, i) => (
                    <Box
                      key={i}
                      textAlign="center"
                      maxHeight={90}
                      p={0.9}
                      sx={{
                        bgcolor: "rgba(255,255,255,0.05)",
                        borderRadius: 1,
                        width: "100%",
                        minWidth: {
                          xs: "13%",
                          sm: "15%",
                          md: "16%",
                          lg: "18%",
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          fontWeight: 400,
                          fontSize: {
                            xs: "0.8rem",
                            sm: "1.2rem",
                            md: "1.3rem",
                          },
                        }}
                      >
                        {h.timeLabel}
                      </Typography>
                      <Typography
                        sx={{
                          fontWeight: 400,
                          fontSize: {
                            xs: "1rem",
                            sm: "1.4rem",
                            md: "1.4rem",
                          },
                        }}
                      >
                        {h.temp}°C
                      </Typography>
                      <Typography
                        sx={{
                          fontWeight: 400,
                          fontSize: {
                            xs: "0.7rem",
                            sm: "1rem",
                            md: "1.1rem",
                          },
                        }}
                      >
                        {h.main}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>

              {/* Weekly Forecast */}
              <Box>
                <Typography variant="subtitle2" mb={1}>
                  Weekly Forecast
                </Typography>
                <Stack spacing={1}>
                  {weeklyForecast.map((d) => (
                    <Box
                      key={d.dateKey}
                      display="flex"
                      alignItems="center"
                      gap={1}
                      flexWrap="wrap"
                    >
                      <Typography sx={{ width: { xs: 80, sm: 120 } }}>
                        {d.dayLabel}
                      </Typography>
                      <Typography sx={{ minWidth: 40 }}>{d.icon}</Typography>
                      <Typography sx={{ color: "skyblue", minWidth: 40 }}>
                        {Math.round(d.min)}°
                      </Typography>
                      <Box sx={{ flex: 1, mx: 1, minWidth: 80 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min((d.max / 45) * 100, 100)}
                          sx={{ height: 8, borderRadius: 2 }}
                        />
                      </Box>
                      <Typography sx={{ color: "tomato", minWidth: 40 }}>
                        {Math.round(d.max)}°
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}
        </Paper>
      </motion.div>

      {/* Footer */}
      <Typography variant="caption" sx={{ opacity: 0.7 }}>
        This App Developed By Ahmed Adel
      </Typography>
    </Box>
  );
}
