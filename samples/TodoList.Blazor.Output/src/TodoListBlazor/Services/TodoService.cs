using System;
using System.Collections.Generic;

namespace TodoListBlazor.Services
{
    public class TodoItem
    {
        public string Title { get; set; }
        public bool IsCompleted { get; set; }
    }

    public class TodoService
    {
        private List<TodoItem> _todoItems;

        public TodoService()
        {
            _todoItems = new List<TodoItem>
            {
                new TodoItem { Title = "Complete assignment", IsCompleted = false },
                new TodoItem { Title = "Buy groceries", IsCompleted = true },
                new TodoItem { Title = "Call mom", IsCompleted = false }
            };
        }

        public List<TodoItem> GetTodoItems()
        {
            return _todoItems;
        }
    }
}
