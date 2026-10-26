import { defineStore } from 'pinia';
import axiosInstance from '../utils/axios';

export interface Post {
  id: number;
  title: string;
  content: string;
  category: string;
  createTime: Date;
  updateTime?: Date;
  User: {
    username: string;
  };
  userId?: number;
}

// 论坛板块常量：与后端 CATEGORIES 保持一致
export const POST_CATEGORIES = ['种植技术', '病虫害防治', '市场行情', '政策资讯', '综合讨论'];

export interface PostQuery {
  limit?: number;
  offset?: number;
  keyword?: string;
  category?: string;
  sort?: 'newest' | 'oldest';
  mine?: boolean;
}

interface PostState {
  posts: Post[];
  total: number;
  loading: boolean;
}

export const usePostStore = defineStore('post', {
  state: (): PostState => ({
    posts: [],
    total: 0,
    loading: false
  }),
  getters: {
    getPostList: (state) => state.posts,
    getPostTotal: (state) => state.total
  },
  actions: {
    // 加载帖子列表：支持板块筛选、关键词搜索、排序、我的帖子
    async loadPosts(query: PostQuery = {}) {
      const { limit = 10, offset = 0, keyword, category, sort, mine } = query;
      try {
        this.loading = true;
        const response = await axiosInstance.get('/post/list', {
          params: {
            limit,
            offset,
            keyword: keyword || undefined,
            category: category || undefined,
            sort: sort || undefined,
            userId: mine ? (localStorage.getItem('userId') ?? undefined) : undefined
          }
        });
        this.posts = response.data.list;
        this.total = response.data.total;
        return { success: true, data: { list: response.data.list, total: response.data.total } };
      } catch (error) {
        console.error('加载帖子列表失败:', error);
        // 接口异常时使用本地兜底数据，保证页面可用
        if (this.posts.length === 0) {
          this.posts = [
            {
              id: 1,
              title: '小麦种植技术分享',
              content: '分享一些小麦种植的经验和技巧，希望对大家有所帮助。',
              category: '种植技术',
              createTime: new Date(),
              User: { username: 'user1' }
            },
            {
              id: 2,
              title: '玉米产量提升方法',
              content: '通过合理施肥和病虫害防治，可以有效提升玉米产量。',
              category: '种植技术',
              createTime: new Date(),
              User: { username: 'user2' }
            }
          ];
          this.total = 2;
        }
        return { success: true, data: { list: this.posts, total: this.total } };
      } finally {
        this.loading = false;
      }
    },

    // 添加帖子（作者身份由后端从 Token 解析）
    async addPost(title: string, content: string, category: string = '综合讨论') {
      try {
        this.loading = true;
        const response = await axiosInstance.post('/post/create', { title, content, category });
        const newPost = response.data;
        this.posts.unshift(newPost);
        this.total++;
        return { success: true, data: newPost };
      } catch (error) {
        console.error('添加帖子失败:', error);
        return { success: false, message: '帖子发布失败，请稍后重试' };
      } finally {
        this.loading = false;
      }
    },

    // 更新帖子
    async updatePost(id: number, title: string, content: string, category?: string) {
      try {
        this.loading = true;
        const response = await axiosInstance.put(`/post/update/${id}`, { title, content, category });
        const updatedPost = response.data;
        const index = this.posts.findIndex(p => p.id === id);
        if (index !== -1) {
          this.posts[index] = updatedPost;
        }
        return { success: true, data: updatedPost };
      } catch (error) {
        console.error('更新帖子失败:', error);
        return { success: false, message: '帖子更新失败，请稍后重试' };
      } finally {
        this.loading = false;
      }
    },

    // 删除帖子
    async deletePost(id: number) {
      try {
        this.loading = true;
        await axiosInstance.delete(`/post/delete/${id}`);
        this.posts = this.posts.filter(p => p.id !== id);
        this.total--;
        return { success: true };
      } catch (error) {
        console.error('删除帖子失败:', error);
        return { success: false, message: '帖子删除失败，请稍后重试' };
      } finally {
        this.loading = false;
      }
    }
  }
});
