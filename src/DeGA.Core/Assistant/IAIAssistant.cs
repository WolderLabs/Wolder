using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public interface IAIAssistant
    {
        Task<string> CompletePromptAsync(string prompt);
    }
}
