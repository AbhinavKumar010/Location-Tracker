import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeftRight,
  Bookmark,
  Clock3,
  Compass,
  Crosshair,
  Download,
  Gauge,
  Home,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import {
  bearingBetween,
  buildReturnRoute,
  calculateRouteDistance,
  formatDate,
  formatDistance,
  formatDuration,
  formatTripDateTime,
  generateTripName,
  getDirectionText,
  getOffRouteStatus,
  isValidPoint,
  nearestPointOnRoute,
  routeToDisplay,
} from './utils/geo'
import { loadHome, loadPlaces, loadTrips, saveHome, savePlaces, saveTrip } from './utils/tripStorage'

const DEFAULT_CENTER = [28.6139, 77.209]
const DEFAULT_GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }

function RecenterMap({ position }) {
  const map = useMap()
  const hasCentered = useRef(false)

  useEffect(() => {
    if (position && !hasCentered.current) {
      map.flyTo([position.lat, position.lng], 17, { duration: 1 })
      hasCentered.current = true
    }
  }, [map, position])
  return null
}

function FocusMap({ position, request }) {
  const map = useMap()
  const lastRequest = useRef(0)

  useEffect(() => {
    if (position && request > 0 && request !== lastRequest.current) {
      map.flyTo([position.lat, position.lng], 18, { duration: 0.8 })
      lastRequest.current = request
    }
  }, [map, position, request])

  return null
}

function MapZoomLimit({ mapView }) {
  const map = useMap()
  const maxZoom = mapView === 'terrain' ? 17 : 18

  useEffect(() => {
    map.setMaxZoom(maxZoom)
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom)
  }, [map, maxZoom])

  return null
}

function App() {
  const [trips, setTrips] = useState([])
  const [activeTrip, setActiveTrip] = useState(null)
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [returnModeTripId, setReturnModeTripId] = useState(null)
  const [isTracking, setIsTracking] = useState(false)
  const [currentPosition, setCurrentPosition] = useState(null)
  const [error, setError] = useState('')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [pendingTrip, setPendingTrip] = useState(null)
  const [tripNameDraft, setTripNameDraft] = useState('')
  const [savePlaceName, setSavePlaceName] = useState('')
  const [showPlacePrompt, setShowPlacePrompt] = useState(false)
  const [places, setPlaces] = useState(() => loadPlaces())
  const [homeLocation, setHomeLocation] = useState(() => loadHome())
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [mapView, setMapView] = useState('standard')
  const [mapFocusRequest, setMapFocusRequest] = useState(0)
  const watchId = useRef(null)

  useEffect(() => {
    loadTrips().then((storedTrips) => {
      setTrips(storedTrips.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)))
      if (storedTrips.length) {
        setSelectedTripId(storedTrips[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!activeTrip) return undefined
    const timer = window.setInterval(() => {
      setActiveTrip((current) => {
        if (!current) return null
        const nextDuration = Math.max(0, Math.round((Date.now() - current.startedAt) / 1000))
        return { ...current, duration: nextDuration, distance: calculateRouteDistance(current.points) }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [activeTrip?.id, isTracking])

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleInstalled = () => {
      setIsInstalled(true)
      setInstallPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current)
  }, [])

  const latestTrip = useMemo(() => [...trips].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0], [trips])
  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || activeTrip || latestTrip || null,
    [activeTrip, latestTrip, selectedTripId, trips],
  )
  const returnTrip = useMemo(
    () => trips.find((trip) => trip.id === returnModeTripId) || null,
    [returnModeTripId, trips],
  )

  const routeForMap = useMemo(() => {
    if (returnModeTripId && returnTrip) return buildReturnRoute(returnTrip.points || [])
    if (activeTrip) return activeTrip.points || []
    if (selectedTrip) return selectedTrip.points || []
    return []
  }, [activeTrip, returnModeTripId, returnTrip, selectedTrip])

  const liveLatestPoint = activeTrip?.points?.at(-1) || selectedTrip?.points?.at(-1) || currentPosition
  const currentDisplayPoint = currentPosition || liveLatestPoint
  const totalDistance = useMemo(() => {
    if (activeTrip) return activeTrip.distance || calculateRouteDistance(activeTrip.points || [])
    if (selectedTrip) return selectedTrip.distance || calculateRouteDistance(selectedTrip.points || [])
    return 0
  }, [activeTrip, selectedTrip])

  const directionInfo = useMemo(() => {
    if (!currentPosition || !routeForMap.length) return { distance: 0, progress: 0, remainingDistance: 0, directionText: '—', status: { label: 'On route', tone: 'good' } }
    const routePoints = routeForMap
    const nearest = nearestPointOnRoute(routePoints, currentPosition)
    const status = getOffRouteStatus(nearest.distance)
    const directionText = nearest.nextPoint ? getDirectionText(nearest.point || routePoints[0], nearest.nextPoint) : '—'
    return {
      distance: nearest.distance,
      progress: nearest.progress,
      remainingDistance: nearest.remainingDistance,
      totalDistance: nearest.totalDistance,
      directionText,
      status,
    }
  }, [currentPosition, routeForMap])

  const latestPoint = currentDisplayPoint

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return undefined
    }

    const onLocationUpdate = ({ coords, timestamp }) => {
      if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
        setError('Received an invalid GPS fix.')
        return
      }

      const nextPoint = {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: Math.max(0, Math.round(coords.accuracy || 0)),
        timestamp: timestamp || Date.now(),
      }

      if (nextPoint.accuracy > 200) {
        setError('GPS signal is weak; navigation may be less accurate.')
      } else {
        setError('')
      }

      setCurrentPosition(nextPoint)

      if (!isTracking || !activeTrip) return
      setActiveTrip((current) => {
        if (!current) return null
        const previous = current.points.at(-1)
        if (previous && calculateRouteDistance([previous, nextPoint]) < 3) return current
        const updatedPoints = [...current.points, nextPoint]
        return {
          ...current,
          points: updatedPoints,
          duration: Math.max(0, Math.round((Date.now() - current.startedAt) / 1000)),
          distance: calculateRouteDistance(updatedPoints),
        }
      })
    }

    const onLocationError = () => {
      setError('Unable to update your location. Check your device permissions.')
    }

    watchId.current = navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, DEFAULT_GPS_OPTIONS)
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [activeTrip, isTracking])

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return
    }

    const nextTripId = globalThis.crypto?.randomUUID?.() || `trip-${Date.now()}`
    const startedAt = Date.now()
    const initialTrip = {
      id: nextTripId,
      name: 'New trip',
      startedAt,
      endedAt: null,
      duration: 0,
      distance: 0,
      points: [],
    }

    setActiveTrip(initialTrip)
    setSelectedTripId(nextTripId)
    setReturnModeTripId(null)
    setIsTracking(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        const firstPoint = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: Math.round(coords.accuracy || 0),
          timestamp: timestamp || Date.now(),
        }

        if (!isValidPoint(firstPoint)) {
          setError('Location permission is needed to start recording.')
          setIsTracking(false)
          setActiveTrip(null)
          return
        }

        setCurrentPosition(firstPoint)
        setActiveTrip((current) => ({
          ...initialTrip,
          ...current,
          points: [firstPoint],
          duration: 0,
          distance: 0,
        }))
      },
      () => {
        setError('Location permission is needed to start recording.')
        setIsTracking(false)
        setActiveTrip(null)
      },
      DEFAULT_GPS_OPTIONS,
    )
  }

  const promptToSaveTrip = () => {
    if (!activeTrip || activeTrip.points.length === 0) return
    const completed = {
      ...activeTrip,
      endedAt: Date.now(),
      duration: Math.max(0, Math.round((Date.now() - activeTrip.startedAt) / 1000)),
      distance: calculateRouteDistance(activeTrip.points),
    }

    setPendingTrip(completed)
    setTripNameDraft(completed.name === 'New trip' ? generateTripName(completed.startedAt) : completed.name)
    setShowNamePrompt(true)
    setIsTracking(false)
  }

  const saveCurrentTrip = async (customName = '') => {
    if (!pendingTrip) return

    const finalName = (customName || tripNameDraft || generateTripName(pendingTrip.startedAt)).trim() || generateTripName(pendingTrip.startedAt)
    const finalTrip = {
      ...pendingTrip,
      name: finalName,
      endedAt: pendingTrip.endedAt || Date.now(),
      duration: Math.max(0, Math.round((pendingTrip.endedAt || Date.now()) - pendingTrip.startedAt) / 1000),
      distance: calculateRouteDistance(pendingTrip.points || []),
    }

    await saveTrip(finalTrip)
    setTrips((current) => [finalTrip, ...current.filter((trip) => trip.id !== finalTrip.id)])
    setSelectedTripId(finalTrip.id)
    setActiveTrip(null)
    setPendingTrip(null)
    setTripNameDraft('')
    setShowNamePrompt(false)
    setError('')
  }

  const clearHistory = () => {
    setActiveTrip(null)
    setIsTracking(false)
    setSelectedTripId(null)
    setReturnModeTripId(null)
    setTrips([])
    setError('')
  }

  const downloadFile = (content, fileName, type) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportTrip = (format) => {
    const exportSource = returnTrip || selectedTrip || activeTrip
    if (!exportSource || !exportSource.points?.length) return

    const route = exportSource.points
    if (format === 'html') {
      const joined = route.map((point) => `[${point.lng}, ${point.lat}]`).join(',')
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${exportSource.name}</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"></head><body style="margin:0"><div id="map" style="height:100vh"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const points=[${joined}];const map=L.map('map').fitBounds(points.map(([lng,lat])=>[lat,lng]));L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);L.polyline(points.map(([lng,lat])=>[lat,lng]),{color:'#5b5cf0',weight:5}).addTo(map);L.circleMarker(points.at(-1).slice().reverse(),{radius:8,color:'#fff',weight:3,fillColor:'#5b5cf0',fillOpacity:1}).addTo(map);</script></body></html>`
      downloadFile(html, `${exportSource.name.toLowerCase().replace(/\s+/g, '-') || 'trip'}.html`, 'text/html')
      return
    }

    if (format === 'json') {
      downloadFile(JSON.stringify(exportSource, null, 2), `${exportSource.name.toLowerCase().replace(/\s+/g, '-') || 'trip'}.json`, 'application/json')
      return
    }

    if (format === 'csv') {
      const csv = [
        'timestamp,latitude,longitude,accuracy',
        ...route.map((point) => `${point.timestamp},${point.lat},${point.lng},${point.accuracy}`),
      ].join('\n')
      downloadFile(csv, `${exportSource.name.toLowerCase().replace(/\s+/g, '-') || 'trip'}.csv`, 'text/csv')
      return
    }

    if (format === 'gpx') {
      const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Vithi">\n  <trk><name>${exportSource.name}</name><trkseg>${route
        .map(
          (point) => `<trkpt lat="${point.lat}" lon="${point.lng}"><ele>0</ele><time>${new Date(point.timestamp).toISOString()}</time></trkpt>`,
        )
        .join('')}</trkseg></trk></gpx>`
      downloadFile(gpx, `${exportSource.name.toLowerCase().replace(/\s+/g, '-') || 'trip'}.gpx`, 'application/gpx+xml')
    }

    setShowExportMenu(false)
  }

  const installApp = async () => {
    if (!installPrompt) {
      setError('Open your browser menu and choose “Add to Home Screen” to install Vithi.')
      return
    }
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  const savePlace = () => {
    if (!currentPosition) {
      setError('Current GPS location is unavailable right now.')
      return
    }
    setShowPlacePrompt(true)
  }

  const confirmPlaceSave = () => {
    if (!currentPosition) return
    const nextPlace = {
      id: globalThis.crypto?.randomUUID?.() || `place-${Date.now()}`,
      name: savePlaceName.trim() || 'Saved Place',
      lat: currentPosition.lat,
      lng: currentPosition.lng,
      createdAt: Date.now(),
    }

    const nextPlaces = [...places, nextPlace]
    setPlaces(nextPlaces)
    savePlaces(nextPlaces)
    setSavePlaceName('')
    setShowPlacePrompt(false)
    setError('')
  }

  const setCurrentAsHome = () => {
    if (!currentPosition) {
      setError('We need a valid GPS fix before setting your home location.')
      return
    }
    setHomeLocation(currentPosition)
    saveHome(currentPosition)
    setError('')
  }

  const navigateHome = () => {
    if (!homeLocation) {
      setError('Set your home location first.')
      return
    }

    const routeSource = latestTrip || selectedTrip || activeTrip
    if (routeSource?.points?.length) {
      setSelectedTripId(routeSource.id)
      setReturnModeTripId(routeSource.id)
      setError('')
      return
    }

    setCurrentPosition((current) => current || homeLocation)
    setError('No recorded route is available, so the map is centered on your home location.')
  }

  const currentTripMetrics = useMemo(() => {
    const source = activeTrip || selectedTrip || latestTrip
    if (!source || !source.points?.length) return null
    const metrics = {
      distance: source.distance || calculateRouteDistance(source.points),
      duration: source.duration || Math.max(0, Math.round((source.endedAt || Date.now()) - source.startedAt) / 1000),
      averageSpeed: source.distance ? (source.distance / 1000) / ((source.duration || 1) / 3600) : 0,
      maxSpeed: 0,
      points: source.points.length,
      averageAccuracy: source.points.reduce((sum, point) => sum + (point.accuracy || 0), 0) / source.points.length,
    }
    return metrics
  }, [activeTrip, latestTrip, selectedTrip])

  const handleTripSelection = (tripId, mode = 'view') => {
    setSelectedTripId(tripId)
    setReturnModeTripId(mode === 'return' ? tripId : null)
  }

  const mapCenter = latestPoint ? [latestPoint.lat, latestPoint.lng] : DEFAULT_CENTER

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Vithi home">
          <span className="brand-mark"><Route size={18} strokeWidth={2.5} /></span>
          <span>Vithi</span>
        </a>

        <div className="header-status">
          <span className={`status-dot ${isTracking ? 'live' : ''}`} />
          {isTracking ? 'Recording live' : 'Ready to track'}
        </div>

        {!isInstalled && (
          <button className="install-button" onClick={installApp}>
            <Download size={15} /> Install app
          </button>
        )}
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">PERSONAL LOCATION JOURNAL</p>
            <h1>Know where you’ve been.</h1>
            <p className="subtitle">A private, simple way to capture your movement and revisit your routes.</p>
          </div>
          <div className="privacy-note">
            <span className="lock-dot">🔒</span>
            Your location stays on this device.
          </div>
        </section>

        <section className="stats-grid" aria-label="Tracking summary">
          <div className="stat-card">
            <span className="stat-icon blue"><Navigation size={17} /></span>
            <div>
              <span className="stat-label">DISTANCE</span>
              <strong>{formatDistance(totalDistance)}</strong>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon violet"><Clock3 size={17} /></span>
            <div>
              <span className="stat-label">DURATION</span>
              <strong>{formatDuration(activeTrip?.duration || selectedTrip?.duration || 0)}</strong>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon green"><Activity size={17} /></span>
            <div>
              <span className="stat-label">GPS POINTS</span>
              <strong>{(activeTrip?.points?.length || selectedTrip?.points?.length || 0) || 0}</strong>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon orange"><Gauge size={17} /></span>
            <div>
              <span className="stat-label">ACCURACY</span>
              <strong>{latestPoint ? `±${latestPoint.accuracy}m` : '—'}</strong>
            </div>
          </div>
        </section>

        <section className="workspace">
          <div className="map-card">
            <div className="map-heading">
              <div>
                <h2>{returnModeTripId ? 'Return to Start' : 'Live route'}</h2>
                <p>
                  {returnModeTripId
                    ? 'Your route is being followed in reverse.'
                    : latestPoint
                      ? 'Your recent movement is shown here.'
                      : 'Start tracking to begin drawing your route.'}
                </p>
              </div>
                  <div className="map-heading-tools">
                    <div className="map-view-switcher" aria-label="Map view">
                      <button className={mapView === 'standard' ? 'active' : ''} onClick={() => setMapView('standard')}>Standard</button>
                      <button className={mapView === 'satellite' ? 'active' : ''} onClick={() => setMapView('satellite')}>Satellite</button>
                      <button className={mapView === 'terrain' ? 'active' : ''} onClick={() => setMapView('terrain')}>Terrain</button>
                    </div>
                    <span className="map-badge">
                      <span className="pulse-dot" />
                      {isTracking ? 'LIVE' : returnModeTripId ? 'RETURN' : 'IDLE'}
                    </span>
                  </div>
            </div>

            <div className="map-wrap">
              <MapContainer center={mapCenter} zoom={latestPoint ? 16 : 11} minZoom={3} maxZoom={mapView === 'terrain' ? 17 : 18} zoomSnap={0.5} scrollWheelZoom attributionControl={false} className="map">
                <RecenterMap position={currentPosition} />
                <FocusMap position={currentPosition} request={mapFocusRequest} />
                <MapZoomLimit mapView={mapView} />
                    <TileLayer
                      key={mapView}
                      url={mapView === 'satellite'
                        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        : mapView === 'terrain'
                            ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
                          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                          maxNativeZoom={mapView === 'terrain' ? 17 : 18}
                          maxZoom={mapView === 'terrain' ? 17 : 18}
                    />

                {selectedTrip && selectedTrip.points?.length > 1 && !returnModeTripId && (
                  <Polyline positions={routeToDisplay(selectedTrip.points)} pathOptions={{ color: '#5b5cf0', weight: 5, opacity: 0.9 }} />
                )}

                {returnModeTripId && returnTrip && returnTrip.points?.length > 1 && (
                  <>
                    <Polyline positions={routeToDisplay(returnTrip.points)} pathOptions={{ color: '#06b6d4', weight: 6, opacity: 0.95 }} />
                    <Polyline positions={routeToDisplay(returnTrip.points.slice().reverse())} pathOptions={{ color: '#64748b', weight: 4, opacity: 0.35, dashArray: '8 10' }} />
                  </>
                )}

                {activeTrip && activeTrip.points?.length > 1 && (
                  <Polyline positions={routeToDisplay(activeTrip.points)} pathOptions={{ color: '#5b5cf0', weight: 5, opacity: 0.9 }} />
                )}

                {currentPosition && (
                  <CircleMarker center={[currentPosition.lat, currentPosition.lng]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#22c55e', fillOpacity: 1 }} />
                )}

                {selectedTrip && selectedTrip.points?.length > 0 && (
                  <>
                    <CircleMarker center={[selectedTrip.points[0].lat, selectedTrip.points[0].lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#10b981', fillOpacity: 1 }} />
                    <CircleMarker center={[selectedTrip.points.at(-1).lat, selectedTrip.points.at(-1).lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#7c3aed', fillOpacity: 1 }} />
                  </>
                )}

                {homeLocation && (
                  <CircleMarker center={[homeLocation.lat, homeLocation.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }} />
                )}

                {places.map((place) => (
                  <CircleMarker key={place.id} center={[place.lat, place.lng]} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1 }} />
                ))}
              </MapContainer>

              <div className="map-controls">
                <button
                  aria-label="Center on current location"
                  onClick={() => currentPosition && setMapFocusRequest((request) => request + 1)}
                >
                  <Crosshair size={17} />
                </button>
              </div>
            </div>

            {error && <p className="error-message">{error}</p>}

            <div className="map-actions">
              {isTracking ? (
                <button className="primary-button stop" onClick={promptToSaveTrip}>
                  <Pause size={17} /> Pause tracking
                </button>
              ) : (
                <button className="primary-button" onClick={startTracking}>
                  <Play size={17} /> Start tracking
                </button>
              )}

              {returnModeTripId ? (
                <button className="text-button" onClick={() => setReturnModeTripId(null)}>
                  <Undo2 size={16} /> Exit Return Mode
                </button>
              ) : (
                selectedTrip && (
                  <button className="text-button" onClick={() => setReturnModeTripId(selectedTrip.id)}>
                    <ArrowLeftRight size={16} /> Return to Start
                  </button>
                )
              )}

              <button className="text-button" onClick={savePlace}>
                <MapPin size={16} /> Save Place
              </button>

              <button className="text-button" onClick={setCurrentAsHome}>
                <Home size={16} /> Set current as Home
              </button>

              <button className="text-button" onClick={navigateHome}>
                <Navigation size={16} /> Navigate Home
              </button>

              <button className="text-button" onClick={() => setShowExportMenu((value) => !value)}>
                <Download size={16} /> Export
              </button>
            </div>

            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => exportTrip('html')}>Route</button>
              </div>
            )}

            {returnModeTripId && returnTrip && currentPosition && (
              <div className="return-panel">
                <div className="return-header">
                  <span className="return-icon"><Undo2 size={16} /></span>
                  <strong>Return to Start</strong>
                </div>

                <div className="return-grid">
                  <div>
                    <span className="label-small">Distance remaining</span>
                    <strong>{formatDistance(directionInfo.remainingDistance)}</strong>
                  </div>
                  <div>
                    <span className="label-small">Status</span>
                    <strong className={`status-pill ${directionInfo.status.tone}`}>{directionInfo.status.label}</strong>
                  </div>
                </div>

                <div className="progress-bar" aria-label="Route progress">
                  <span style={{ width: `${Math.min(100, Math.max(0, directionInfo.progress))}%` }} />
                </div>

                <div className="route-meta">
                  <span>You are {formatDistance(directionInfo.distance)} from route</span>
                  <span>{Math.round(directionInfo.progress)}% complete</span>
                </div>

                <div className="direction-row">
                  <Compass size={16} />
                  <span>{directionInfo.directionText}</span>
                </div>
              </div>
            )}
          </div>

          <aside className="history-card">
            <div className="history-heading">
              <div>
                <h2>My Trips</h2>
                <p>{trips.length ? 'Your saved routes are ready to revisit.' : 'No trips saved yet'}</p>
              </div>
              <span className="count-pill">{trips.length}</span>
            </div>

            <div className="trip-list">
              {trips.length ? (
                trips.map((trip) => (
                  <div key={trip.id} className={`trip-card ${selectedTripId === trip.id ? 'selected' : ''}`}>
                    <div className="trip-card-header">
                      <strong>{trip.name}</strong>
                      <span>{formatDate(trip.startedAt)}</span>
                    </div>
                    <div className="trip-card-meta">
                      <span>{formatDistance(trip.distance || calculateRouteDistance(trip.points || []))}</span>
                      <span>{formatDuration(trip.duration || 0)}</span>
                      <span>{trip.points?.length || 0} pts</span>
                    </div>
                    <div className="trip-actions">
                      <button onClick={() => handleTripSelection(trip.id, 'view')}>View Route</button>
                      <button className="secondary" onClick={() => handleTripSelection(trip.id, 'return')}>Return</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><LocateFixed size={20} /></span>
                  <strong>Your trip history is empty</strong>
                  <span>Start a route and save it to build your personal travel log.</span>
                </div>
              )}
            </div>
          </aside>
        </section>

        {currentTripMetrics && (
          <section className="summary-card">
            <div className="summary-header">
              <div>
                <p className="eyebrow small">TRIP SUMMARY</p>
                <h2>{activeTrip?.name || selectedTrip?.name || 'Current Trip'}</h2>
              </div>
              <span>{formatTripDateTime(activeTrip?.startedAt || selectedTrip?.startedAt || Date.now())}</span>
            </div>

            <div className="summary-grid">
              <div>
                <span className="summary-label">Distance</span>
                <strong>{formatDistance(currentTripMetrics.distance)}</strong>
              </div>
              <div>
                <span className="summary-label">Duration</span>
                <strong>{formatDuration(currentTripMetrics.duration)}</strong>
              </div>
              <div>
                <span className="summary-label">Average speed</span>
                <strong>{(currentTripMetrics.averageSpeed || 0).toFixed(1)} km/h</strong>
              </div>
              <div>
                <span className="summary-label">Maximum speed</span>
                <strong>{(currentTripMetrics.maxSpeed || 0).toFixed(1)} km/h</strong>
              </div>
              <div>
                <span className="summary-label">GPS points</span>
                <strong>{currentTripMetrics.points}</strong>
              </div>
              <div>
                <span className="summary-label">Average accuracy</span>
                <strong>±{Math.round(currentTripMetrics.averageAccuracy || 0)} m</strong>
              </div>
            </div>
          </section>
        )}

        <section className="feedback-card" aria-labelledby="feedback-heading">
          <div>
            <p className="eyebrow small">HELP IMPROVE VITHI</p>
            <h2 id="feedback-heading">Have feedback?</h2>
            <p>Tell us what worked, what felt unclear, or what would make your next route better.</p>
          </div>
          <a
            className="feedback-button"
            href="mailto:?subject=Feedback%20for%20Vithi&body=Hi%20Vithi%20team%2C%0A%0A"
          >
            <Mail size={17} />
            Email feedback
          </a>
        </section>
      </main>

      {showNamePrompt && pendingTrip && (
        <div className="prompt-backdrop" onClick={() => setShowNamePrompt(false)}>
          <div className="prompt-card" onClick={(event) => event.stopPropagation()}>
            <div className="prompt-header">
              <h3>Trip name</h3>
            </div>
            <input
              type="text"
              value={tripNameDraft}
              onChange={(event) => setTripNameDraft(event.target.value)}
              placeholder="Evening Walk"
            />
            <div className="prompt-actions">
              <button className="secondary-button" onClick={() => setShowNamePrompt(false)}>Cancel</button>
              <button className="primary-button" onClick={() => saveCurrentTrip()}>Save Trip</button>
            </div>
          </div>
        </div>
      )}

      {showPlacePrompt && (
        <div className="prompt-backdrop" onClick={() => setShowPlacePrompt(false)}>
          <div className="prompt-card" onClick={(event) => event.stopPropagation()}>
            <div className="prompt-header">
              <h3>Place name</h3>
            </div>
            <input
              type="text"
              value={savePlaceName}
              onChange={(event) => setSavePlaceName(event.target.value)}
              placeholder="Home"
            />
            <div className="prompt-actions">
              <button className="secondary-button" onClick={() => setShowPlacePrompt(false)}>Cancel</button>
              <button className="primary-button" onClick={confirmPlaceSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
