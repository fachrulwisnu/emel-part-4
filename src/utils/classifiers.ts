export function classifyEmail(subject: string): { category: string; subCategory: string } {
  const subjUpper = (subject || '').toUpperCase();
  
  if (subjUpper.includes('SPEEDTEST RUTIN')) {
    const match = subject.match(/SPEEDTEST RUTIN\s+(.*)/i);
    const sub = match ? match[1].trim() : 'General';
    return {
      category: 'Speedtest Routine',
      subCategory: sub || 'General'
    };
  }
  
  if (subjUpper.includes('TUGAS SHIFT MALAM')) {
    const match = subject.match(/Tugas Shift Malam\s*[-–:]?\s*(.*)/i);
    const sub = match ? match[1].trim() : 'General';
    return {
      category: 'Tugas Shift Malam',
      subCategory: sub || 'General'
    };
  }
  
  const cleanSubj = subject || '';
  const sub = cleanSubj.length > 30 ? cleanSubj.substring(0, 30) + '...' : cleanSubj;
  return {
    category: 'Uncategorized',
    subCategory: sub || '(No Subject)'
  };
}

export function classifyFolder(sender: string, subject: string): { folder_parent: string; folder_child: string } {
  const subj = subject || '';
  const subjUpper = subj.toUpperCase();

  if (subjUpper.includes('SPEEDTEST')) {
    let child = 'General';
    const cabangMatch = subj.match(/(?:cabang|rutin)\s+([a-zA-Z0-9\s\-]+)/i);
    if (cabangMatch && cabangMatch[1].trim()) {
      child = cabangMatch[1].trim();
    } else {
      const stMatch = subj.match(/speedtest\s+([a-zA-Z0-9\s\-]+)/i);
      if (stMatch && stMatch[1].trim()) {
        child = stMatch[1].trim();
      }
    }
    
    child = child.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').trim();

    return {
      folder_parent: 'Speedtest',
      folder_child: child || 'General'
    };
  }

  if (subjUpper.includes('FSD') || subjUpper.includes('SIT') || subjUpper.includes('UAT') || subjUpper.includes('APPROVAL')) {
    let child = 'General Approval';
    if (subjUpper.includes('FSD')) {
      child = 'FSD';
    } else if (subjUpper.includes('UAT')) {
      child = 'UAT';
    } else if (subjUpper.includes('SIT')) {
      child = 'SIT';
    }
    return {
      folder_parent: 'Approval',
      folder_child: child
    };
  }

  if (subjUpper.includes('MEETING') || subjUpper.includes('MOM') || subjUpper.includes('INVITATION')) {
    let child = 'General Meeting';
    if (subjUpper.includes('MOM')) {
      child = 'MoM';
    } else if (subjUpper.includes('INVITATION') || subjUpper.includes('INVITE')) {
      child = 'Invitation';
    }
    return {
      folder_parent: 'Meeting',
      folder_child: child
    };
  }

  return {
    folder_parent: 'Lainnya',
    folder_child: 'Umum'
  };
}
