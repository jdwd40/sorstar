import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'

interface Planet {
  id: string
  name: string
  type: 'Agricultural' | 'Industrial' | 'Technological' | 'Mining' | 'Mixed'
  position_x: number
  position_y: number
  population: number
  happiness: number
  owner_id: string | null
  resources: Resource[]
  factories: Factory[]
  military_units: MilitaryUnit[]
}

interface Resource {
  type: string
  amount: number
  production_rate: number
  storage_capacity: number
}

interface Factory {
  type: string
  level: number
  efficiency: number
  workers: number
}

interface MilitaryUnit {
  type: string
  quantity: number
  experience_level: number
}

const typeColors = {
  Agricultural: 'bg-green-700',
  Industrial: 'bg-gray-700',
  Technological: 'bg-blue-700',
  Mining: 'bg-amber-700',
  Mixed: 'bg-purple-700',
}

const typeIcons = {
  Agricultural: '🌾',
  Industrial: '🏭',
  Technological: '🔬',
  Mining: '⛏️',
  Mixed: '🔄',
}

export default function GalaxyMap() {
  const [planets, setPlanets] = useState<Planet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlanet, setSelectedPlanet] = useState<Planet | null>(null)

  useEffect(() => {
    async function fetchPlanets() {
      try {
        const { data: planetsData, error: planetsError } = await supabase
          .from('planets')
          .select(`
            *,
            resources (*),
            factories (*),
            military_units (*)
          `)
        
        if (planetsError) throw planetsError
        if (planetsData) setPlanets(planetsData)
      } catch (error) {
        console.error('Error fetching planets:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPlanets()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-white text-xl">Loading galaxy data...</div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-blue-300">Galaxy Map</h1>
        <div className="text-gray-300">
          Total Planets: {planets.length}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {planets.map((planet) => (
          <div 
            key={planet.id}
            onClick={() => setSelectedPlanet(planet)}
            className={`${typeColors[planet.type]} rounded-lg shadow-lg overflow-hidden 
              transition-transform hover:scale-105 cursor-pointer
              ${selectedPlanet?.id === planet.id ? 'ring-2 ring-blue-400' : ''}`}
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <span>{typeIcons[planet.type]}</span>
                  {planet.name}
                </h2>
                <span className="px-2 py-1 rounded text-sm bg-opacity-50 bg-black">
                  {planet.type}
                </span>
              </div>
              
              <div className="space-y-2 text-gray-200">
                <div>Population: {planet.population.toLocaleString()}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span>Happiness:</span>
                    <div className="flex-1 bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-green-500 rounded-full h-2"
                        style={{ width: `${planet.happiness * 100}%` }}
                      />
                    </div>
                    <span>{(planet.happiness * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Resources Summary */}
              {planet.resources && planet.resources.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2 text-gray-200">Resources</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {planet.resources.map((resource) => (
                      <div 
                        key={resource.type}
                        className="bg-black bg-opacity-30 rounded p-2"
                      >
                        <div className="font-medium">{resource.type}</div>
                        <div className="text-sm text-gray-300">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-700 rounded-full h-1">
                              <div 
                                className="bg-blue-500 rounded-full h-1"
                                style={{ width: `${(resource.amount / resource.storage_capacity) * 100}%` }}
                              />
                            </div>
                            <span>{Math.round((resource.amount / resource.storage_capacity) * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Planet Details Modal */}
      {selectedPlanet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 p-6 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span>{typeIcons[selectedPlanet.type]}</span>
                  {selectedPlanet.name}
                </h2>
                <button 
                  onClick={() => setSelectedPlanet(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-blue-300 mb-4">Planet Information</h3>
                <div className="grid grid-cols-2 gap-4 text-gray-200">
                  <div>Type: {selectedPlanet.type}</div>
                  <div>Population: {selectedPlanet.population.toLocaleString()}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span>Happiness:</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-green-500 rounded-full h-2"
                          style={{ width: `${selectedPlanet.happiness * 100}%` }}
                        />
                      </div>
                      <span>{(selectedPlanet.happiness * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  <div>Position: ({selectedPlanet.position_x.toFixed(2)}, {selectedPlanet.position_y.toFixed(2)})</div>
                </div>
              </div>

              {/* Resources Section */}
              <div>
                <h3 className="text-lg font-semibold text-blue-300 mb-4">Resources</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedPlanet.resources.map((resource) => (
                    <div key={resource.type} className="bg-gray-700 rounded p-4">
                      <div className="font-semibold mb-2">{resource.type}</div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm">Storage:</span>
                            <div className="flex-1 bg-gray-600 rounded-full h-2">
                              <div 
                                className="bg-blue-500 rounded-full h-2"
                                style={{ width: `${(resource.amount / resource.storage_capacity) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm">{Math.round((resource.amount / resource.storage_capacity) * 100)}%</span>
                          </div>
                          <div className="text-sm text-gray-300">
                            {resource.amount.toLocaleString()} / {resource.storage_capacity.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-sm">
                          Production Rate: {resource.production_rate}/hr
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Factories Section */}
              {selectedPlanet.factories && selectedPlanet.factories.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-blue-300 mb-4">Factories</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedPlanet.factories.map((factory) => (
                      <div key={factory.type} className="bg-gray-700 rounded p-4">
                        <div className="font-semibold mb-2">{factory.type}</div>
                        <div className="space-y-2 text-sm">
                          <div>Level: {factory.level}</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span>Efficiency:</span>
                              <div className="flex-1 bg-gray-600 rounded-full h-2">
                                <div 
                                  className="bg-green-500 rounded-full h-2"
                                  style={{ width: `${factory.efficiency * 100}%` }}
                                />
                              </div>
                              <span>{(factory.efficiency * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div>Workers: {factory.workers.toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Military Units Section */}
              {selectedPlanet.military_units && selectedPlanet.military_units.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-blue-300 mb-4">Military Forces</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedPlanet.military_units.map((unit) => (
                      <div key={unit.type} className="bg-gray-700 rounded p-4">
                        <div className="font-semibold mb-2">{unit.type}</div>
                        <div className="space-y-2 text-sm">
                          <div>Quantity: {unit.quantity.toLocaleString()}</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span>Experience:</span>
                              <div className="flex-1 bg-gray-600 rounded-full h-2">
                                <div 
                                  className="bg-yellow-500 rounded-full h-2"
                                  style={{ width: `${unit.experience_level * 100}%` }}
                                />
                              </div>
                              <span>{(unit.experience_level * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
