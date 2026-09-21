import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Clock3,
  Crosshair,
  Download,
  Gauge,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route,
  Trash2,
} from 'lucide-react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const STORAGE_KEY = 'trailmark-location-history'
const DEFAULT_CENTER = [28.6139, 77.209]

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${secs}s`
}

const formatDistance = (meters) => {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

const distanceBetween = (a, b) => {
  const earthRadius = 6371000
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lng - a.lng) * Math.PI) / 180
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function RecenterMap({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo([position.lat, position.lng], 16, { duration: 1 })
  }, [map, position])
  return null
}

function App() {
  const [points, setPoints] = useState(() => {
    try {
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000
      return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).filter((point) => point.timestamp >= cutoff)
    } catch {
      return []
    }
  })
  const [isTracking, setIsTracking] = useState(() => Boolean(Number(localStorage.getItem('trailmark-started-at'))))
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Number(localStorage.getItem('trailmark-started-at')) || null)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const watchId = useRef(null)

  const latestPoint = points.at(-1)
  const totalDistance = useMemo(
    () => points.slice(1).reduce((total, point, index) => total + distanceBetween(points[index], point), 0),
    [points],
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points))
  }, [points])

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

  useEffect(() => {
    if (!startedAt) return undefined
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current)
  }, [])

  const recordPosition = ({ coords, timestamp }) => {
    const nextPoint = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: Math.round(coords.accuracy),
      timestamp: timestamp || Date.now(),
    }
    setPoints((current) => {
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000
      const recentPoints = current.filter((point) => point.timestamp >= cutoff)
      const previous = recentPoints.at(-1)
      if (previous && distanceBetween(previous, nextPoint) < 3) return current
      return [...recentPoints, nextPoint]
    })
    setError('')
  }

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return
    }
    setError('')
    setIsTracking(true)
    const trackingStart = startedAt || Date.now()
    setStartedAt(trackingStart)
    localStorage.setItem('trailmark-started-at', String(trackingStart))
    navigator.geolocation.getCurrentPosition(recordPosition, () => {
      setError('Location permission is needed to start recording.')
      setIsTracking(false)
      setStartedAt(null)
      localStorage.removeItem('trailmark-started-at')
    }, { enableHighAccuracy: true })
  }

  const stopTracking = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setIsTracking(false)
    setStartedAt(null)
    localStorage.removeItem('trailmark-started-at')
  }

  useEffect(() => {
    if (!startedAt || !navigator.geolocation) return undefined
    watchId.current = navigator.geolocation.watchPosition(recordPosition, () => {
      setError('Unable to update your location. Check your device permissions.')
    }, { enableHighAccuracy: true, maximumAge: 10000 })
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [startedAt])

  const clearHistory = () => {
    stopTracking()
    setPoints([])
    setElapsed(0)
    setError('')
  }

  const downloadMap = () => {
    if (!points.length) return
    const route = points.map((point) => `[${point.lng}, ${point.lat}]`).join(',')
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vithi route</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"></head><body style="margin:0"><div id="map" style="height:100vh"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const points=[${route}];const map=L.map('map').fitBounds(points.map(([lng,lat])=>[lat,lng]));L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);L.polyline(points.map(([lng,lat])=>[lat,lng]),{color:'#5b5cf0',weight:5}).addTo(map);L.circleMarker(points.at(-1).slice().reverse(),{radius:8,color:'#fff',weight:3,fillColor:'#5b5cf0',fillOpacity:1}).addTo(map);</script></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vithi-route-${new Date().toISOString().slice(0, 10)}.html`
    link.click()
    URL.revokeObjectURL(url)
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

  const center = latestPoint ? [latestPoint.lat, latestPoint.lng] : DEFAULT_CENTER
  const displayDuration = isTracking ? elapsed : points.length > 1 ? elapsed : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Vithi home">
          <span className="brand-mark"><Route size={18} strokeWidth={2.5} /></span>
          <span>Vithi</span>
        </a>
        <div className="header-status"><span className={`status-dot ${isTracking ? 'live' : ''}`} /> {isTracking ? 'Recording live' : 'Ready to track'}</div>
        {!isInstalled && <button className="install-button" onClick={installApp}><Download size={15} /> Install app</button>}
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">PERSONAL LOCATION JOURNAL</p>
            <h1>Know where you’ve been.</h1>
            <p className="subtitle">A private, simple way to capture your movement and revisit your routes.</p>
          </div>
          <div className="privacy-note"><span className="lock-dot">●</span> Stored locally on this device</div>
        </section>

        <section className="stats-grid" aria-label="Tracking summary">
          <div className="stat-card"><span className="stat-icon blue"><Navigation size={17} /></span><div><span className="stat-label">DISTANCE TODAY</span><strong>{formatDistance(totalDistance)}</strong></div></div>
          <div className="stat-card"><span className="stat-icon violet"><Clock3 size={17} /></span><div><span className="stat-label">TRACKING TIME</span><strong>{formatDuration(displayDuration)}</strong></div></div>
          <div className="stat-card"><span className="stat-icon green"><Activity size={17} /></span><div><span className="stat-label">LOCATION POINTS</span><strong>{points.length}</strong></div></div>
          <div className="stat-card"><span className="stat-icon orange"><Gauge size={17} /></span><div><span className="stat-label">ACCURACY</span><strong>{latestPoint ? `±${latestPoint.accuracy}m` : '—'}</strong></div></div>
        </section>

        <section className="workspace">
          <div className="map-card">
            <div className="map-heading"><div><h2>Live route</h2><p>{latestPoint ? 'Your recent movement is shown here.' : 'Start tracking to begin drawing your route.'}</p></div><span className="map-badge"><span className="pulse-dot" /> {isTracking ? 'LIVE' : 'IDLE'}</span></div>
            <div className="map-wrap">
              <MapContainer center={center} zoom={latestPoint ? 16 : 11} scrollWheelZoom attributionControl={false} className="map">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {points.length > 1 && <Polyline positions={points.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#5b5cf0', weight: 5, lineCap: 'round', lineJoin: 'round' }} />}
                {latestPoint && <><CircleMarker center={[latestPoint.lat, latestPoint.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#5b5cf0', fillOpacity: 1 }} /><RecenterMap position={latestPoint} /></>}
              </MapContainer>
              <div className="map-controls"><button onClick={() => latestPoint && document.querySelector('.leaflet-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} aria-label="Center on current location"><Crosshair size={17} /></button></div>
            </div>
            {error && <p className="error-message">{error}</p>}
            <div className="map-actions">
              {isTracking ? <button className="primary-button stop" onClick={stopTracking}><Pause size={17} /> Pause tracking</button> : <button className="primary-button" onClick={startTracking}><Play size={17} /> Start tracking</button>}
              {points.length > 0 && <button className="text-button" onClick={downloadMap}><Download size={16} /> Download map</button>}
              {points.length > 0 && <button className="text-button danger" onClick={clearHistory}><Trash2 size={16} /> Clear history</button>}
            </div>
          </div>

          <aside className="history-card">
            <div className="history-heading"><div><h2>Recent activity</h2><p>{points.length ? 'Latest recorded locations' : 'No activity recorded yet'}</p></div><span className="count-pill">{points.length}</span></div>
            <div className="activity-list">
              {points.length ? [...points].reverse().slice(0, 6).map((point, index) => (
                <div className="activity-row" key={`${point.timestamp}-${index}`}><span className="activity-pin"><MapPin size={15} /></span><div><strong>{index === 0 ? 'Current location' : 'Location point'}</strong><span>{new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ±{point.accuracy}m</span></div></div>
              )) : <div className="empty-state"><span className="empty-icon"><LocateFixed size={20} /></span><strong>Your trail starts here</strong><span>Press start tracking and allow location access to begin.</span></div>}
            </div>
            {points.length > 6 && <button className="view-all">View all {points.length} points <span>→</span></button>}
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
