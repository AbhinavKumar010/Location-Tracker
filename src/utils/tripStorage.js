const DB_NAME = 'vithi-db'
const STORE_NAME = 'trips'

const fallbackTripsKey = 'vithi-trips'
const fallbackPlacesKey = 'vithi-places'
const fallbackHomeKey = 'vithi-home'

const openDatabase = () =>
  new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open IndexedDB.'))
  })

export const loadTrips = async () => {
  try {
    const db = await openDatabase()
    return new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => resolve([])
    })
  } catch {
    try {
      const stored = JSON.parse(localStorage.getItem(fallbackTripsKey) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  }
}

export const saveTrip = async (trip) => {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(trip)
      request.onsuccess = () => resolve(trip)
      request.onerror = () => reject(request.error || new Error('Could not save trip.'))
    })
  } catch {
    const stored = JSON.parse(localStorage.getItem(fallbackTripsKey) || '[]')
    const updated = [...stored.filter((item) => item.id !== trip.id), trip]
    localStorage.setItem(fallbackTripsKey, JSON.stringify(updated))
    return trip
  }
}

export const deleteTrip = async (tripId) => {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(tripId)
      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error || new Error('Could not delete trip.'))
    })
  } catch {
    const stored = JSON.parse(localStorage.getItem(fallbackTripsKey) || '[]')
    const filtered = stored.filter((item) => item.id !== tripId)
    localStorage.setItem(fallbackTripsKey, JSON.stringify(filtered))
    return true
  }
}

export const loadPlaces = () => {
  try {
    return JSON.parse(localStorage.getItem(fallbackPlacesKey) || '[]')
  } catch {
    return []
  }
}

export const savePlaces = (places) => {
  localStorage.setItem(fallbackPlacesKey, JSON.stringify(places))
}

export const loadHome = () => {
  try {
    return JSON.parse(localStorage.getItem(fallbackHomeKey) || 'null')
  } catch {
    return null
  }
}

export const saveHome = (homeLocation) => {
  if (!homeLocation) return
  localStorage.setItem(fallbackHomeKey, JSON.stringify(homeLocation))
}
