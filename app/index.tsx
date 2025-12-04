import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native'
import { supabase } from '@/lib/supabase'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'

export default function DriverHomeScreen() {
  const [isOnline, setIsOnline] = useState(false)
  const [availableOrders, setAvailableOrders] = useState<any[]>([])
  const [activeOrder, setActiveOrder] = useState<any>(null)
  const [stats, setStats] = useState({
    todayDeliveries: 0,
    todayEarnings: 0,
    totalDeliveries: 0,
    rating: 5.0
  })

  useEffect(() => {
    requestLocationPermission()
    fetchDriverStats()
    fetchAvailableOrders()
  }, [])

  useEffect(() => {
    if (isOnline) {
      startLocationTracking()
    }
  }, [isOnline])

  const requestLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      alert('Location permission is required for delivery')
    }
  }

  const startLocationTracking = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Update driver availability
    await supabase
      .from('driver_details')
      .update({ is_available: isOnline })
      .eq('user_id', user.id)

    if (isOnline) {
      // Track location every 30 seconds
      setInterval(async () => {
        const location = await Location.getCurrentPositionAsync({})
        await supabase
          .from('driver_details')
          .update({
            current_latitude: location.coords.latitude,
            current_longitude: location.coords.longitude
          })
          .eq('user_id', user.id)
      }, 30000)
    }
  }

  const fetchDriverStats = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: driverData } = await supabase
      .from('driver_details')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Get today's deliveries
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('total')
      .eq('driver_id', user.id)
      .eq('status', 'delivered')
      .gte('delivered_at', today.toISOString())

    const todayEarnings = todayOrders?.reduce((sum, order) => sum + (Number(order.total) * 0.1), 0) || 0

    setStats({
      todayDeliveries: todayOrders?.length || 0,
      todayEarnings: todayEarnings,
      totalDeliveries: driverData?.total_deliveries || 0,
      rating: driverData?.rating || 5.0
    })
  }

  const fetchAvailableOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, users(full_name, phone), addresses(*)')
      .eq('status', 'ready')
      .is('driver_id', null)
      .order('created_at', { ascending: true })

    setAvailableOrders(data || [])
  }

  const acceptOrder = async (orderId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('orders')
      .update({
        driver_id: user.id,
        status: 'assigned'
      })
      .eq('id', orderId)

    if (!error) {
      alert('Order accepted!')
      fetchAvailableOrders()
      
      // Fetch the accepted order
      const { data: order } = await supabase
        .from('orders')
        .select('*, users(full_name, phone), addresses(*)')
        .eq('id', orderId)
        .single()

      setActiveOrder(order)
    }
  }

  const updateOrderStatus = async (status: string) => {
    if (!activeOrder) return

    await supabase
      .from('orders')
      .update({ status })
      .eq('id', activeOrder.id)

    if (status === 'delivered') {
      await supabase
        .from('orders')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', activeOrder.id)

      // Update driver stats
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: driverData } = await supabase
          .from('driver_details')
          .select('total_deliveries')
          .eq('user_id', user.id)
          .single()

        await supabase
          .from('driver_details')
          .update({ total_deliveries: (driverData?.total_deliveries || 0) + 1 })
          .eq('user_id', user.id)
      }

      setActiveOrder(null)
      fetchDriverStats()
      fetchAvailableOrders()
    } else {
      setActiveOrder({ ...activeOrder, status })
    }
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Zynk Driver</Text>
        <View style={styles.onlineToggle}>
          <Text style={styles.onlineText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <Switch
            value={isOnline}
            onValueChange={setIsOnline}
            trackColor={{ false: '#d1d5db', true: '#10b981' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle" size={32} color="#10b981" />
          <Text style={styles.statValue}>{stats.todayDeliveries}</Text>
          <Text style={styles.statLabel}>Today's Deliveries</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="cash" size={32} color="#3b82f6" />
          <Text style={styles.statValue}>${stats.todayEarnings.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Today's Earnings</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="trophy" size={32} color="#f59e0b" />
          <Text style={styles.statValue}>{stats.totalDeliveries}</Text>
          <Text style={styles.statLabel}>Total Deliveries</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="star" size={32} color="#eab308" />
          <Text style={styles.statValue}>{stats.rating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      {/* Active Order */}
      {activeOrder && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Delivery</Text>
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderNumber}>{activeOrder.order_number}</Text>
              <Text style={[styles.statusBadge, { backgroundColor: '#3b82f6' }]}>
                {activeOrder.status}
              </Text>
            </View>
            <View style={styles.orderDetail}>
              <Ionicons name="person" size={16} color="#6b7280" />
              <Text style={styles.orderDetailText}>{activeOrder.users?.full_name}</Text>
            </View>
            <View style={styles.orderDetail}>
              <Ionicons name="location" size={16} color="#6b7280" />
              <Text style={styles.orderDetailText}>
                {activeOrder.addresses?.address_line1}, {activeOrder.addresses?.city}
              </Text>
            </View>
            <View style={styles.orderDetail}>
              <Ionicons name="cash" size={16} color="#6b7280" />
              <Text style={styles.orderDetailText}>${Number(activeOrder.total).toFixed(2)}</Text>
            </View>

            <View style={styles.actionButtons}>
              {activeOrder.status === 'assigned' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10b981' }]}
                  onPress={() => updateOrderStatus('picked_up')}
                >
                  <Text style={styles.actionButtonText}>Mark Picked Up</Text>
                </TouchableOpacity>
              )}
              {activeOrder.status === 'picked_up' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
                  onPress={() => updateOrderStatus('in_transit')}
                >
                  <Text style={styles.actionButtonText}>Start Delivery</Text>
                </TouchableOpacity>
              )}
              {activeOrder.status === 'in_transit' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#10b981' }]}
                  onPress={() => updateOrderStatus('delivered')}
                >
                  <Text style={styles.actionButtonText}>Mark Delivered</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Available Orders */}
      {!activeOrder && isOnline && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Orders ({availableOrders.length})</Text>
          {availableOrders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderNumber}>{order.order_number}</Text>
                <Text style={styles.orderAmount}>${Number(order.total).toFixed(2)}</Text>
              </View>
              <View style={styles.orderDetail}>
                <Ionicons name="location" size={16} color="#6b7280" />
                <Text style={styles.orderDetailText}>
                  {order.addresses?.address_line1}, {order.addresses?.city}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#10b981', marginTop: 12 }]}
                onPress={() => acceptOrder(order.id)}
              >
                <Text style={styles.actionButtonText}>Accept Order</Text>
              </TouchableOpacity>
            </View>
          ))}
          {availableOrders.length === 0 && (
            <Text style={styles.emptyText}>No orders available at the moment</Text>
          )}
        </View>
      )}

      {!isOnline && (
        <View style={styles.offlineContainer}>
          <Ionicons name="moon" size={64} color="#d1d5db" />
          <Text style={styles.offlineText}>You're offline</Text>
          <Text style={styles.offlineSubtext}>Turn on to start receiving orders</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineText: {
    marginRight: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    color: '#111827',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111827',
  },
  orderCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderDetailText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  actionButtons: {
    marginTop: 12,
  },
  actionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 14,
    marginTop: 16,
  },
  offlineContainer: {
    alignItems: 'center',
    marginTop: 64,
  },
  offlineText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b7280',
    marginTop: 16,
  },
  offlineSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
})
