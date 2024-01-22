using System.Collections.Generic;
using System.Linq;

namespace TodoList.Blazor.Services
{
    public class TodoItemService
    {
        public List<string> TodoItems { get; private set; }

        public TodoItemService()
        {
            TodoItems = new List<string>();
        }

        public void AddTodoItem(string item)
        {
            TodoItems.Add(item);
        }

        public void RemoveTodoItem(string item)
        {
            TodoItems.Remove(item);
        }
    }
}
