export const distanceBetween = (a, b) => {
  if (!a || !b) return 0
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

export const formatDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

export const formatDuration = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export const formatClockTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })

export const formatDate = (timestamp) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp))

export const formatTripDateTime = (timestamp) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))

export const generateTripName = (timestamp) => {
  const date = new Date(timestamp)
  return `Trip · ${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)} · ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

export const calculateRouteDistance = (points = []) => {
  if (points.length < 2) return 0
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]
    return total + distanceBetween(previous, point)
  }, 0)
}

export const calculateAverageSpeed = (distanceMeters, seconds) => {
  if (!seconds || seconds <= 0) return 0
  return (distanceMeters / 1000 / (seconds / 3600)) || 0
}

export const calculateTripMetrics = (trip) => {
  const distance = calculateRouteDistance(trip.points || [])
  const duration = trip.duration || Math.max(0, Math.round((trip.endedAt || Date.now() - trip.startedAt) / 1000))

  const pointAccuracy = trip.points.length ? trip.points.reduce((sum, point) => sum + Number(point.accuracy || 0), 0) / trip.points.length : 0

  return {
    distance,
    duration,
    averageSpeed: calculateAverageSpeed(distance, duration),
    maxSpeed: trip.maxSpeed || 0,
    points: trip.points.length,
    averageAccuracy: pointAccuracy,
  }
}

export const isValidPoint = (point) => {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (point.accuracy > 200 || point.accuracy < 0) return false
  return true
}

export const toLatLng = (point) => [point.lat, point.lng]

export const routeToDisplay = (points = []) => points.map((point) => [point.lat, point.lng])

export const bearingBetween = (from, to) => {
  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180
  const dLon = ((to.lng - from.lng) * Math.PI) / 180

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const angle = (Math.atan2(y, x) * 180) / Math.PI
  return (angle + 360) % 360
}

export const bearingToDirection = (bearing) => {
  const directions = [
    'North',
    'Northeast',
    'East',
    'Southeast',
    'South',
    'Southwest',
    'West',
    'Northwest',
  ]

  const index = Math.round(bearing / 45) % 8
  return directions[index]
}

export const getDirectionText = (from, to) => {
  const bearing = bearingBetween(from, to)
  const direction = bearingToDirection(bearing)
  const short = direction.toLowerCase()
  return `↖ Continue ${short}`
}

export const nearestPointOnRoute = (points = [], currentPosition) => {
  if (!currentPosition || points.length === 0) {
    return {
      distance: Infinity,
      point: null,
      index: 0,
      progress: 0,
      remainingDistance: 0,
      totalDistance: 0,
      nextPoint: null,
      directionText: '—',
    }
  }

  let nearestDistance = Infinity
  let nearestPoint = points[0]
  let nearestIndex = 0
  let segmentDistance = 0

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]
    const end = points[i + 1]
    const dx = end.lng - start.lng
    const dy = end.lat - start.lat
    const lengthSq = dx * dx + dy * dy

    if (lengthSq === 0) {
      const candidateDistance = distanceBetween(currentPosition, start)
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance
        nearestPoint = start
        nearestIndex = i
        segmentDistance = 0
      }
      continue
    }

    const t = ((currentPosition.lng - start.lng) * dx + (currentPosition.lat - start.lat) * dy) / lengthSq
    const clamped = Math.max(0, Math.min(1, t))
    const projected = {
      lat: start.lat + (end.lat - start.lat) * clamped,
      lng: start.lng + (end.lng - start.lng) * clamped,
    }
    const candidateDistance = distanceBetween(currentPosition, projected)

    if (candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance
      nearestPoint = projected
      nearestIndex = i
      segmentDistance = distanceBetween(start, projected)
    }
  }

  const cumulative = [0]
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distanceBetween(points[i - 1], points[i]))
  }

  const totalDistance = cumulative.at(-1) || 0
  const traveledDistance = cumulative[nearestIndex] + segmentDistance
  const remainingDistance = Math.max(0, totalDistance - traveledDistance)
  const progress = totalDistance > 0 ? (traveledDistance / totalDistance) * 100 : 0
  const nextPoint = points[Math.min(nearestIndex + 1, points.length - 1)] || nearestPoint

  return {
    distance: nearestDistance,
    point: nearestPoint,
    index: nearestIndex,
    progress,
    remainingDistance,
    totalDistance,
    nextPoint,
    directionText: getDirectionText(nearestPoint, nextPoint),
  }
}

export const buildReturnRoute = (points = []) => [...points].reverse()

export const getOffRouteStatus = (distanceMeters) => {
  if (distanceMeters <= 20) return { label: 'On route', tone: 'good' }
  if (distanceMeters <= 50) return { label: 'Slightly off route', tone: 'warning' }
  return { label: 'You are off route', tone: 'danger' }
}

export const getTripSummary = (trip) => {
  const points = trip.points || []
  const distance = calculateRouteDistance(points)
  const duration = trip.duration || Math.max(0, Math.floor((trip.endedAt - trip.startedAt) / 1000))
  const averageSpeed = calculateAverageSpeed(distance, duration)
  return {
    distance,
    duration,
    averageSpeed,
    points: points.length,
    accuracyAverage: points.length ? points.reduce((sum, point) => sum + (point.accuracy || 0), 0) / points.length : 0,
  }
}
