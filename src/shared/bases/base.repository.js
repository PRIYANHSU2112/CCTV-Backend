/**
 * BaseRepository providing generic data access pattern & operations
 */
export class BaseRepository {
  constructor(initialData = []) {
    // In-memory data storage backing (abstract database interface)
    this.store = new Map(initialData.map((item) => [item.id, item]));
  }

  async findById(id) {
    return this.store.get(id) || null;
  }

  async findAll(filter = {}) {
    let items = Array.from(this.store.values());
    
    // Simple filter matching
    if (Object.keys(filter).length > 0) {
      items = items.filter((item) => {
        return Object.entries(filter).every(([key, val]) => item[key] === val);
      });
    }

    return items;
  }

  async findPaginated(skip = 0, limit = 10) {
    const allItems = Array.from(this.store.values());
    const total = allItems.length;
    const items = allItems.slice(skip, skip + limit);

    return { items, total };
  }

  async create(data) {
    const id = data.id || `id_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const record = {
      id,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.store.set(id, record);
    return record;
  }

  async update(id, data) {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };

    this.store.set(id, updated);
    return updated;
  }

  async delete(id) {
    return this.store.delete(id);
  }
}
