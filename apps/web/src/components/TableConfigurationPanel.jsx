import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit2, Loader2, Info, DoorOpen, DoorClosed, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';

export default function TableConfigurationPanel() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', room: '', capacity: '' });

  const toggleReserved = async (table) => {
    try {
      await pb.collection('table_configurations').update(
        table.id,
        { isReserved: !table.isReserved, reservedInfo: table.isReserved ? '' : 'Manually reserved' },
        { $autoCancel: false }
      );
      toast.success(table.isReserved ? 'Table marked available' : 'Table marked reserved');
      fetchTables();
    } catch (e) {
      toast.error('Failed to update table status');
    }
  };

  const toggleActive = async (table) => {
    try {
      await pb.collection('table_configurations').update(
        table.id,
        { isActive: table.isActive === false ? true : false },
        { $autoCancel: false }
      );
      toast.success(table.isActive === false ? 'Table enabled' : 'Table disabled');
      fetchTables();
    } catch (e) {
      toast.error('Failed to update table active status');
    }
  };

  const fetchTables = async () => {
    setLoading(true);
    try {
      const records = await pb.collection('table_configurations').getFullList({ sort: 'room,name', $autoCancel: false });
      setTables(records);
    } catch (e) {
      toast.error('Failed to load table configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const resetForm = () => {
    setFormData({ name: '', room: '', capacity: '' });
    setEditingId(null);
  };

  const handleEdit = (table) => {
    setEditingId(table.id);
    setFormData({
      name: table.name,
      room: table.room,
      capacity: table.capacity?.toString() || ''
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this table?')) return;
    try {
      await pb.collection('table_configurations').delete(id, { $autoCancel: false });
      toast.success('Table deleted successfully');
      fetchTables();
    } catch (e) {
      toast.error('Failed to delete table');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.room) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        room: formData.room,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : null
      };

      if (editingId) {
        await pb.collection('table_configurations').update(editingId, payload, { $autoCancel: false });
        toast.success('Table updated successfully');
      } else {
        await pb.collection('table_configurations').create(payload, { $autoCancel: false });
        toast.success('Table added successfully');
      }
      resetForm();
      fetchTables();
    } catch (e) {
      toast.error(editingId ? 'Failed to update table' : 'Failed to add table');
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedTables = tables.reduce((acc, table) => {
    if (!acc[table.room]) acc[table.room] = [];
    acc[table.room].push(table);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <Card className="border-2 border-border shadow-sm">
        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-5 items-end">
            <div className="space-y-2 w-full md:w-[40%]">
              <Label className="text-foreground font-semibold">Table Name/Number *</Label>
              <Input 
                required 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="e.g. T12 or Window 1" 
                className="bg-background text-foreground"
              />
            </div>
            <div className="space-y-2 w-full md:w-[25%]">
              <Label className="text-foreground font-semibold">Room *</Label>
              <Select value={formData.room} onValueChange={v => setFormData({...formData, room: v})} required>
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue placeholder="Select Room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Room 1">Room 1</SelectItem>
                  <SelectItem value="Room 2">Room 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-full md:w-[20%]">
              <Label className="text-foreground font-semibold">Capacity</Label>
              <Input 
                type="number" 
                min="1" 
                value={formData.capacity} 
                onChange={e => setFormData({...formData, capacity: e.target.value})} 
                placeholder="e.g. 4" 
                className="bg-background text-foreground"
              />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto min-w-[100px]">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? 'Update' : 'Add Table')}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : tables.length === 0 ? (
        <Card className="border border-dashed bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <Info className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium text-lg">No tables configured yet.</p>
            <p className="text-sm">Use the form above to add your first table.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedTables).map(([room, roomTables]) => (
            <div key={room} className="space-y-4">
              <h3 className="text-xl font-serif font-bold text-primary border-b-2 border-border pb-2">{room}</h3>
              <Card className="overflow-hidden border-border shadow-sm">
                <Table>
                  <TableHeader className="admin-table-header">
                    <TableRow>
                      <TableHead>Table Name/Number</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roomTables.map(t => (
                      <TableRow key={t.id} className="admin-table-row">
                        <TableCell className="font-bold text-foreground">{t.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.capacity ? `${t.capacity} persons` : 'Not set'}
                        </TableCell>
                        <TableCell>
                          {t.isReserved ? (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">Reserved</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300">Available</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-2 ${t.isActive === false ? 'text-muted-foreground' : 'text-emerald-600 hover:text-emerald-700'}`}
                            onClick={() => toggleActive(t)}
                            title={t.isActive === false ? 'Enable table' : 'Disable table'}
                          >
                            {t.isActive === false ? (
                              <><ToggleLeft className="h-5 w-5 mr-1" /> Disabled</>
                            ) : (
                              <><ToggleRight className="h-5 w-5 mr-1" /> Active</>
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => toggleReserved(t)}
                              title={t.isReserved ? 'Mark Available' : 'Mark Reserved'}
                            >
                              {t.isReserved ? <DoorOpen className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                              onClick={() => handleEdit(t)}
                              title="Edit Table"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(t.id)}
                              title="Delete Table"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}