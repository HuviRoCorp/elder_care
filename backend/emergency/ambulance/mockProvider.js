// ============================================================================
// Mock Ambulance Provider
//
// Simulates an external emergency ambulance dispatch service.
// Isolated behind the backend service layer so that swapping this for a real
// ambulance provider API later requires zero changes to database schemas, Express
// controllers, frontend screens, or API contracts.
// ============================================================================

/**
 * Simulates dispatching an ambulance for a booking request.
 *
 * @param {object} bookingData
 * @param {string} bookingData.id
 * @param {string} bookingData.pickupAddress
 * @param {string} bookingData.destinationHospital
 * @returns {Promise<object>} Dispatch details to be stored in the database
 */
export async function dispatchAmbulance({ id, pickupAddress, destinationHospital }) {
  // Simulate network delay of third-party dispatch API (100ms)
  await new Promise((resolve) => setTimeout(resolve, 100));

  const randomRefId = Math.floor(10000 + Math.random() * 90000);
  const randomEta = Math.floor(5 + Math.random() * 8); // 5 to 12 minutes

  const mockDrivers = [
    { name: 'Rajesh Kumar', phone: '+919876543210', vehicle: 'KA-01-EQ-9911' },
    { name: 'Suresh Patel', phone: '+919812345678', vehicle: 'KA-05-EM-4422' },
    { name: 'Ramesh Verma', phone: '+919765432109', vehicle: 'KA-03-AM-7788' },
  ];

  const driver = mockDrivers[Math.floor(Math.random() * mockDrivers.length)];

  return {
    providerName: 'ElderCare Emergency Fleet (Mock)',
    providerReference: `MOCK-AMB-${randomRefId}`,
    driverName: driver.name,
    driverPhone: driver.phone,
    vehicleNumber: driver.vehicle,
    etaMinutes: randomEta,
    status: 'dispatched',
    dispatchedAt: new Date().toISOString(),
  };
}
