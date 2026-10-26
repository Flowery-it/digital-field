<template>
  <AdminShell>
    <el-card class="admin-card">
      <template #header>
        <div class="card-header">
          <span>作物数据管理</span>
          <el-button type="primary" @click="handleAdd">添加作物数据</el-button>
        </div>
      </template>
          <div class="crop-manage-content">
            <!-- 搜索和筛选 -->
            <div class="search-container">
              <el-input
                v-model="searchForm.cropType"
                placeholder="请输入作物类型"
                prefix-icon="Search"
                class="search-input"
              />
              <el-input
                v-model="searchForm.region"
                placeholder="请输入地区"
                prefix-icon="Location"
                class="search-input"
              />
              <el-button type="primary" @click="handleSearch">搜索</el-button>
              <el-button @click="resetSearch">重置</el-button>
            </div>

            <!-- 作物数据列表 -->
            <el-table
              v-loading="loading"
              :data="cropList"
              style="width: 100%"
              border
            >
              <el-table-column prop="id" label="ID" width="80" />
              <el-table-column prop="cropType" label="作物类型" width="120" />
              <el-table-column prop="year" label="年份" width="100" />
              <el-table-column prop="yield" label="产量(万吨)" width="120" />
              <el-table-column prop="price" label="价格(元/公斤)" width="120" />
              <el-table-column prop="region" label="地区" width="150" />
              <el-table-column label="操作" width="180">
                <template #default="scope">
                  <el-button type="primary" size="small" @click="handleEdit(scope.row)">
                    编辑
                  </el-button>
                  <el-button type="danger" size="small" @click="handleDelete(scope.row.id)">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <!-- 分页 -->
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="currentPage"
                v-model:page-size="pageSize"
                :page-sizes="[5, 10, 20]"
                layout="total, sizes, prev, pager, next, jumper"
                :total="total"
                @size-change="handleSizeChange"
                @current-change="handleCurrentChange"
              />
            </div>
          </div>
        </el-card>

    <!-- 作物数据编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingCrop ? '编辑作物数据' : '添加作物数据'"
      :width="dialogWidth"
    >
      <el-form
        ref="cropFormRef"
        :model="cropForm"
        :rules="cropRules"
        label-width="100px"
      >
        <el-form-item label="作物类型" prop="cropType">
          <el-input v-model="cropForm.cropType" placeholder="请输入作物类型" />
        </el-form-item>
        <el-form-item label="年份" prop="year">
          <el-input v-model.number="cropForm.year" type="number" placeholder="请输入年份" />
        </el-form-item>
        <el-form-item label="产量(万吨)" prop="yield">
          <el-input v-model.number="cropForm.yield" type="number" step="0.01" placeholder="请输入产量" />
        </el-form-item>
        <el-form-item label="价格(元/公斤)" prop="price">
          <el-input v-model.number="cropForm.price" type="number" step="0.01" placeholder="请输入价格" />
        </el-form-item>
        <el-form-item label="地区" prop="region">
          <el-input v-model="cropForm.region" placeholder="请输入地区" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit">
            {{ editingCrop ? '更新' : '保存' }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </AdminShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useViewportWidth } from '../../composables/useViewportWidth';
import { ElMessage } from 'element-plus';
import AdminShell from '../../components/AdminShell.vue';
import { useAdminGuard } from '../../composables/useAdminGuard';

const adminGuard = useAdminGuard();

const loading = ref(false);
const cropList = ref<any[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const dialogVisible = ref(false);
const editingCrop = ref<any>(null);
const cropFormRef = ref();

// 弹窗响应式宽度：小屏用百分比，避免固定 600px 溢出（与其他弹窗保持一致）
const viewportWidth = useViewportWidth();
const dialogWidth = computed(() => (viewportWidth.value <= 640 ? '92%' : '600px'));

const searchForm = ref({
  cropType: '',
  region: ''
});

const cropForm = ref({
  cropType: '',
  year: 2023,
  yield: 0,
  price: 0,
  region: ''
});

const cropRules = ref({
  cropType: [{ required: true, message: '请输入作物类型', trigger: 'blur' }],
  year: [{ required: true, message: '请输入年份', trigger: 'blur' }],
  yield: [{ required: true, message: '请输入产量', trigger: 'blur' }],
  price: [{ required: true, message: '请输入价格', trigger: 'blur' }],
  region: [{ required: true, message: '请输入地区', trigger: 'blur' }]
});

// 加载作物数据列表
const loadCropList = async () => {
  loading.value = true;
  try {
    // 这里应该调用后端API获取作物数据列表
    // 由于后端API尚未实现，使用模拟数据
    cropList.value = [
      { id: 1, cropType: '小麦', year: 2023, yield: 1390, price: 2.8, region: '北京' },
      { id: 2, cropType: '水稻', year: 2023, yield: 1510, price: 3.0, region: '北京' },
      { id: 3, cropType: '玉米', year: 2023, yield: 2700, price: 2.3, region: '北京' },
      { id: 4, cropType: '大豆', year: 2023, yield: 175, price: 5.0, region: '北京' },
      { id: 5, cropType: '小麦', year: 2022, yield: 1377, price: 2.7, region: '北京' }
    ];
    total.value = cropList.value.length;
  } catch (error) {
    console.error('加载作物数据失败:', error);
  } finally {
    loading.value = false;
  }
};

// 处理添加作物数据
const handleAdd = () => {
  editingCrop.value = null;
  cropForm.value = {
    cropType: '',
    year: 2023,
    yield: 0,
    price: 0,
    region: ''
  };
  dialogVisible.value = true;
};

// 处理编辑作物数据
const handleEdit = (crop: any) => {
  editingCrop.value = crop;
  cropForm.value = {
    cropType: crop.cropType,
    year: crop.year,
    yield: crop.yield,
    price: crop.price,
    region: crop.region
  };
  dialogVisible.value = true;
};

// 处理删除作物数据
const handleDelete = async (id: number) => {
  try {
    // 这里应该调用后端API删除作物数据
    // 由于后端API尚未实现，直接模拟删除
    cropList.value = cropList.value.filter(item => item.id !== id);
    total.value = cropList.value.length;
    ElMessage.success('作物数据删除成功');
  } catch (error) {
    console.error('删除作物数据失败:', error);
  }
};

// 处理提交作物数据
const handleSubmit = async () => {
  if (!cropFormRef.value) return;
  
  try {
    await cropFormRef.value.validate();
    
    if (editingCrop.value) {
      // 更新作物数据
      // 这里应该调用后端API更新作物数据
      // 由于后端API尚未实现，直接模拟更新
      const index = cropList.value.findIndex(item => item.id === editingCrop.value.id);
      if (index !== -1) {
        cropList.value[index] = {
          ...cropList.value[index],
          ...cropForm.value
        };
      }
      ElMessage.success('作物数据更新成功');
    } else {
      // 添加作物数据
      // 这里应该调用后端API添加作物数据
      // 由于后端API尚未实现，直接模拟添加
      const newCrop = {
        id: cropList.value.length + 1,
        ...cropForm.value
      };
      cropList.value.unshift(newCrop);
      total.value = cropList.value.length;
      ElMessage.success('作物数据添加成功');
    }
    
    dialogVisible.value = false;
  } catch (error) {
    console.error('提交作物数据失败:', error);
  }
};

// 搜索处理
const handleSearch = () => {
  currentPage.value = 1;
  loadCropList();
};

// 重置搜索
const resetSearch = () => {
  searchForm.value = {
    cropType: '',
    region: ''
  };
  currentPage.value = 1;
  loadCropList();
};

// 分页处理
const handleSizeChange = (size: number) => {
  pageSize.value = size;
  currentPage.value = 1;
  loadCropList();
};

const handleCurrentChange = (current: number) => {
  currentPage.value = current;
  loadCropList();
};

onMounted(() => {
  // 管理端守卫：未登录或非管理员回落管理员登录页
  if (!adminGuard()) return;
  loadCropList();
});
</script>

<style scoped>
/* 壳层（页头/侧栏/主区/卡片）与菜单、分页样式已由全局 design tokens 统一提供 */

.search-container {
  display: flex;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  align-items: center;
}

.search-input {
  width: 200px;
  max-width: 100%;
}
</style>
