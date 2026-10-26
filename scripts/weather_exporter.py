import requests
import csv
import os
from datetime import datetime

# 和风天气API配置
API_KEY = os.environ.get("QWEATHER_API_KEY", "")
API_URL = "https://kk4d92hd6y.re.qweatherapi.com/v7/weather/7d"

# 读取城市代码
def read_city_codes(file_path):
    city_codes = {}
    try:
        with open(file_path, mode="r", encoding="utf-8") as csvfile:
            reader = csv.reader(csvfile)
            for row in reader:
                if len(row) >= 3:
                    city_codes[row[2]] = row[0]
    except Exception as e:
        print(f"读取城市代码文件时出错: {e}")
    return city_codes

def get_city_weather(city_code):
    """获取指定城市的7日天气预报"""
    if not API_KEY:
        print("未配置 QWEATHER_API_KEY 环境变量，请先设置后再运行")
        return []
    try:
        # 请求参数
        params = {
            "key": API_KEY,
            "location": city_code
        }
        
        # 发送请求
        response = requests.get(API_URL, params=params)
        response.raise_for_status() 
        
        data = response.json()
        if data.get("code") == "200":
            return data.get("daily", [])
        else:
            print(f"API请求失败，错误码: {data.get('code')}，错误信息: {data.get('message')}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"网络请求异常: {e}")
        return []
    except Exception as e:
        print(f"发生未知错误: {e}")
        return []

def save_all_to_csv(all_weather_data):
    if not all_weather_data:
        print("没有数据可保存")
        return
    
    # 固定保存目录
    os.makedirs("weather_data", exist_ok=True)
    
    # 固定文件名
    file_path = "weather_data/all_cities_weather.csv"
    
    # 气象数据列
    fieldnames = [
        "数据获取时间", "城市", "日期", "白天天气", "夜间天气", 
        "最高温度(°C)", "最低温度(°C)", "温度差(°C)",
        "白天风力", "夜间风力", "降水量(mm)", "湿度(%)"
    ]
    
    try:
        # 获取当前时间
        fetch_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # 检查文件
        file_exists = os.path.isfile(file_path)
        
        with open(file_path, mode="a", newline="", encoding="utf-8-sig") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            # 写入表头
            if not file_exists:
                writer.writeheader()
            
            for city, weather_data in all_weather_data.items():
                for day in weather_data:
                    # 计算温度差
                    temp_diff = int(day.get("tempMax")) - int(day.get("tempMin"))
                    
                    # 写入数据
                    writer.writerow({
                        "数据获取时间": fetch_time,
                        "城市": city,
                        "日期": day.get("fxDate"),
                        "白天天气": day.get("textDay"),
                        "夜间天气": day.get("textNight"),
                        "最高温度(°C)": day.get("tempMax"),
                        "最低温度(°C)": day.get("tempMin"),
                        "温度差(°C)": temp_diff,
                        "白天风力": f"{day.get('windDirDay')} {day.get('windScaleDay')}级",
                        "夜间风力": f"{day.get('windDirNight')} {day.get('windScaleNight')}级",
                        "降水量(mm)": day.get("precip"),
                        "湿度(%)": day.get("humidity")
                    })
        
        print(f"数据已成功获取到: {file_path}")
        return file_path
    except Exception as e:
        print(f"保存CSV文件时出错: {e}")
        return None

def main():
    city_codes = read_city_codes("China-City-List-latest.csv")
    all_weather_data = {}
    while True:
        city = input("请输入要查询的城市名称（输入q退出）：").strip()
        
        if city.lower() == "q":
            break
        
        if not city:
            print("城市名称不能为空，请重新输入")
            continue
        
        city_code = city_codes.get(city)
        if city_code:
            print(f"正在获取{city}的7日天气预报...")
            weather_data = get_city_weather(city_code)
            
            if weather_data:
                all_weather_data[city] = weather_data
                print(f'{city}的天气预报已成功获取')
            else:
                print(f"未能获取{city}的天气数据，请检查城市名称或API配置")
        else:
            print(f"未找到{city}的城市代码，请检查输入或城市代码文件。")
        
        print("-" * 50)
    
    if all_weather_data:
        save_all_to_csv(all_weather_data)

if __name__ == "__main__":
    print("===== 气象数据搜索 =====")
    main()
